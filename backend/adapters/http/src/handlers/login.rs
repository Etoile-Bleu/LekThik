use application::{LoginUser, LoginUserError};
use axum::Json;
use axum::extract::State;
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use validator::Validate;

use crate::dto::{ErrorResponseDto, LoginUserRequestDto};
use crate::state::{AppState, SESSION_COOKIE};

#[utoipa::path(
    post,
    path = "/auth/login",
    tag = "auth",
    summary = "Log in with email and password",
    description = "Verifies the password against the stored argon2 hash and sets a session cookie carrying a short-lived JWT.",
    request_body = LoginUserRequestDto,
    responses(
        (status = 204, description = "Session cookie set"),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
    )
)]
pub async fn login_user(
    State(state): State<AppState>,
    Json(payload): Json<LoginUserRequestDto>,
) -> Response {
    if let Err(validation_errors) = payload.validate() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponseDto {
                message: validation_errors.to_string(),
            }),
        )
            .into_response();
    }

    let use_case = LoginUser::new(state.user_repo.clone());

    let user = match use_case.execute(&payload.email, &payload.password).await {
        Ok(user) => user,
        Err(error @ LoginUserError::InvalidCredentials) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponseDto {
                    message: error.to_string(),
                }),
            )
                .into_response();
        }
        Err(error @ LoginUserError::Repository(_)) => {
            eprintln!("login_user failed: {error}");

            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponseDto {
                    message: "internal server error".to_string(),
                }),
            )
                .into_response();
        }
    };

    let token = match state.token_issuer.issue(user.id) {
        Ok(token) => token,
        Err(error) => {
            eprintln!("issuing session token failed: {error}");

            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponseDto {
                    message: "internal server error".to_string(),
                }),
            )
                .into_response();
        }
    };

    let mut response = StatusCode::NO_CONTENT.into_response();
    response.headers_mut().append(
        header::SET_COOKIE,
        HeaderValue::from_str(&format!(
            "{SESSION_COOKIE}={token}; HttpOnly; Secure; SameSite=Lax; Path=/"
        ))
        .unwrap_or(HeaderValue::from_static("")),
    );
    response
}
