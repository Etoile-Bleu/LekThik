use application::{GetCurrentUser, GetCurrentUserError};
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

use crate::auth::AuthUser;
use crate::dto::{ErrorResponseDto, UserResponseDto};
use crate::state::AppState;

#[utoipa::path(
    get,
    path = "/users/me",
    tag = "users",
    summary = "Get the current user",
    description = "Returns the account tied to the session cookie. Requires a valid session.",
    responses(
        (status = 200, body = UserResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn get_current_user(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Response {
    let use_case = GetCurrentUser::new(state.user_repo.clone());

    match use_case.execute(user_id).await {
        Ok(user) => (
            StatusCode::OK,
            Json(UserResponseDto {
                id: user.id,
                email: user.email,
                username: user.username,
            }),
        )
            .into_response(),
        Err(GetCurrentUserError::NotFound) => (
            StatusCode::NOT_FOUND,
            Json(ErrorResponseDto {
                message: "user not found".to_string(),
            }),
        )
            .into_response(),
        Err(error @ GetCurrentUserError::Repository(_)) => {
            eprintln!("get_current_user failed: {error}");

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
