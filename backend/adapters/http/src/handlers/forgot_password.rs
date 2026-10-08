use application::RequestPasswordReset;
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use validator::Validate;

use crate::dto::{ErrorResponseDto, ForgotPasswordRequestDto};
use crate::state::AppState;

#[utoipa::path(
    post,
    path = "/auth/forgot-password",
    tag = "auth",
    summary = "Request a password reset code",
    description = "Emails a six digit reset code when the account exists. Always answers 204 so it cannot be used to discover which emails are registered.",
    request_body = ForgotPasswordRequestDto,
    responses(
        (status = 204, description = "Request accepted"),
        (status = 400, body = ErrorResponseDto),
    )
)]
pub async fn forgot_password(
    State(state): State<AppState>,
    Json(payload): Json<ForgotPasswordRequestDto>,
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

    let use_case = RequestPasswordReset::new(
        state.user_repo.clone(),
        state.verification_code_repo.clone(),
        state.mailer.clone(),
    );

    if let Err(error) = use_case.execute(&payload.email).await {
        eprintln!("forgot_password failed: {error}");
    }

    StatusCode::NO_CONTENT.into_response()
}
