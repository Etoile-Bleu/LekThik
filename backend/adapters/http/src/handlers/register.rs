use application::{RegisterUser, RegisterUserError};
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use validator::Validate;

use crate::dto::{ErrorResponseDto, RegisterUserRequestDto, RegisteredUserResponseDto};
use crate::state::AppState;

#[utoipa::path(
    post,
    path = "/users/register",
    tag = "users",
    summary = "Register a new user",
    description = "Creates a user with an argon2-hashed password, ready to sign in immediately. Rejects an email or username already in use.",
    request_body = RegisterUserRequestDto,
    responses(
        (status = 201, body = RegisteredUserResponseDto),
        (status = 400, body = ErrorResponseDto),
        (status = 409, body = ErrorResponseDto),
    )
)]
pub async fn register_user(
    State(state): State<AppState>,
    Json(payload): Json<RegisterUserRequestDto>,
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

    let use_case = RegisterUser::new(state.user_repo.clone());

    match use_case
        .execute(payload.email, payload.username, &payload.password)
        .await
    {
        Ok(registered) => {
            println!("registered {}", registered.email);

            (
                StatusCode::CREATED,
                Json(RegisteredUserResponseDto {
                    id: registered.id,
                    email: registered.email,
                    username: registered.username,
                }),
            )
                .into_response()
        }
        Err(RegisterUserError::EmailAlreadyRegistered) => (
            StatusCode::CONFLICT,
            Json(ErrorResponseDto {
                message: "email already registered".to_string(),
            }),
        )
            .into_response(),
        Err(RegisterUserError::UsernameAlreadyTaken) => (
            StatusCode::CONFLICT,
            Json(ErrorResponseDto {
                message: "username already taken".to_string(),
            }),
        )
            .into_response(),
        Err(error @ (RegisterUserError::HashingFailed | RegisterUserError::Repository(_))) => {
            eprintln!("register_user failed: {error}");

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
