use application::{ResetPassword, ResetPasswordError};
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use validator::Validate;

use crate::dto::{ErrorResponseDto, ResetPasswordRequestDto};
use crate::state::AppState;

#[utoipa::path(
    post,
    path = "/auth/reset-password",
    tag = "auth",
    summary = "Reset a password with an emailed code",
    description = "Checks the six digit reset code and replaces the password with an argon2 hash. A code expires after ten minutes, works once and is locked after five wrong attempts.",
    request_body = ResetPasswordRequestDto,
    responses(
        (status = 204, description = "Password updated"),
        (status = 400, body = ErrorResponseDto),
    )
)]
pub async fn reset_password(
    State(state): State<AppState>,
    Json(payload): Json<ResetPasswordRequestDto>,
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

    let use_case = ResetPassword::new(
        state.user_repo.clone(),
        state.verification_code_repo.clone(),
    );

    match use_case
        .execute(&payload.email, &payload.code, &payload.password)
        .await
    {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error @ ResetPasswordError::InvalidCode) => (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponseDto {
                message: error.to_string(),
            }),
        )
            .into_response(),
        Err(error @ (ResetPasswordError::HashingFailed | ResetPasswordError::Repository(_))) => {
            eprintln!("reset_password failed: {error}");

            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponseDto {
                    message: "internal server error".to_string(),
                }),
            )
                .into_response()
        }
    }
}
