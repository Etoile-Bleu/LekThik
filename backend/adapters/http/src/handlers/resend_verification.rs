use application::ResendEmailVerification;
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use validator::Validate;

use crate::dto::{ErrorResponseDto, ResendVerificationRequestDto};
use crate::state::AppState;

#[utoipa::path(
    post,
    path = "/auth/resend-verification",
    tag = "auth",
    summary = "Resend the verification code",
    description = "Emails a fresh verification code when the account exists and is not verified yet. Always answers 204 so it cannot be used to discover which emails are registered.",
    request_body = ResendVerificationRequestDto,
    responses(
        (status = 204, description = "Request accepted"),
        (status = 400, body = ErrorResponseDto),
    )
)]
pub async fn resend_verification(
    State(state): State<AppState>,
    Json(payload): Json<ResendVerificationRequestDto>,
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

    let use_case = ResendEmailVerification::new(
        state.user_repo.clone(),
        state.verification_code_repo.clone(),
        state.mailer.clone(),
    );

    if let Err(error) = use_case.execute(&payload.email).await {
        eprintln!("resend_verification failed: {error}");
    }

    StatusCode::NO_CONTENT.into_response()
}
