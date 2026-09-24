use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};

pub const SESSION_COOKIE: &str = "session";

#[utoipa::path(
    post,
    path = "/auth/logout",
    tag = "auth",
    summary = "Log out",
    description = "Clears the session cookie. The JWT is stateless and short-lived, so this only affects the client; a copy of the token remains valid until it expires.",
    responses((status = 204, description = "Session cookie cleared"))
)]
pub async fn logout() -> Response {
    let mut response = StatusCode::NO_CONTENT.into_response();
    response.headers_mut().append(
        header::SET_COOKIE,
        HeaderValue::from_str(&format!(
            "{SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
        ))
        .unwrap_or(HeaderValue::from_static("")),
    );
    response
}
