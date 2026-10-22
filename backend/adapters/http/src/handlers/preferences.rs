use application::{GetPreferences, SavePreferences};
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use domain::{Preferences, PreferencesError};

use crate::auth::AuthUser;
use crate::dto::ErrorResponseDto;
use crate::state::AppState;

fn failure(error: PreferencesError) -> Response {
    match error {
        PreferencesError::Invalid(message) => {
            (StatusCode::BAD_REQUEST, Json(ErrorResponseDto { message })).into_response()
        }
        PreferencesError::Repository(message) => {
            eprintln!("preferences repository failed: {message}");
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

#[utoipa::path(
    get,
    path = "/users/me/preferences",
    tag = "users",
    summary = "Get my display preferences",
    description = "Theme, density, text size, motion, what cards show, and per board settings. Someone who never saved anything gets the defaults.",
    responses(
        (status = 200, description = "The preferences object", body = Object),
        (status = 401, body = ErrorResponseDto),
    )
)]
pub async fn get_preferences(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Response {
    match GetPreferences::new(state.preferences_repo.clone())
        .execute(user_id)
        .await
    {
        Ok(preferences) => (StatusCode::OK, Json(preferences)).into_response(),
        Err(error) => failure(error),
    }
}

#[utoipa::path(
    put,
    path = "/users/me/preferences",
    tag = "users",
    summary = "Save my display preferences",
    description = "Replaces the whole preferences object. Unknown fields and values are refused, and settings are kept for at most 200 boards.",
    request_body = Object,
    responses(
        (status = 200, description = "The saved preferences", body = Object),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
    )
)]
pub async fn save_preferences(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(preferences): Json<Preferences>,
) -> Response {
    match SavePreferences::new(state.preferences_repo.clone())
        .execute(user_id, preferences)
        .await
    {
        Ok(saved) => (StatusCode::OK, Json(saved)).into_response(),
        Err(error) => failure(error),
    }
}
