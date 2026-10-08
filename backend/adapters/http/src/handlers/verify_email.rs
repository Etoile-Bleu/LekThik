use application::{VerifyEmail, VerifyEmailError};
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use validator::Validate;

use crate::dto::{ErrorResponseDto, VerifyEmailRequestDto};
use crate::state::AppState;

#[utoipa::path(
    post,
    path = "/auth/verify-email",
    tag = "auth",
    summary = "Verify an email address",
    description = "Checks the six digit code emailed at registration. A code expires after ten minutes and is locked after five wrong attempts.",
    request_body = VerifyEmailRequestDto,
    responses(
        (status = 204, description = "Email verified, the account can now sign in"),
        (status = 400, body = ErrorResponseDto),
    )
)]
pub async fn verify_email(
    State(state): State<AppState>,
    Json(payload): Json<VerifyEmailRequestDto>,
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

    let use_case = VerifyEmail::new(
        state.user_repo.clone(),
        state.verification_code_repo.clone(),
    );

    match use_case.execute(&payload.email, &payload.code).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error @ VerifyEmailError::InvalidCode) => (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponseDto {
                message: error.to_string(),
            }),
        )
            .into_response(),
        Err(error @ VerifyEmailError::Repository(_)) => {
            eprintln!("verify_email failed: {error}");

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
