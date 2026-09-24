use axum::Json;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::{StatusCode, header};
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::state::AppState;
use crate::user_dto::ErrorResponseDto;

pub struct AuthUser(pub Uuid);

fn unauthorized() -> Response {
    (
        StatusCode::UNAUTHORIZED,
        Json(ErrorResponseDto {
            message: "missing or invalid session".to_string(),
        }),
    )
        .into_response()
}

fn extract_session_cookie(parts: &Parts) -> Option<String> {
    let cookie_header = parts.headers.get(header::COOKIE)?.to_str().ok()?;
    cookie_header.split(';').map(str::trim).find_map(|pair| {
        let (key, value) = pair.split_once('=')?;
        (key == "session").then(|| value.to_string())
    })
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = Response;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token = extract_session_cookie(parts).ok_or_else(unauthorized)?;

        state
            .token_issuer
            .verify(&token)
            .map(AuthUser)
            .map_err(|_| unauthorized())
    }
}
