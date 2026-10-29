use application::{GetCalendarToken, RegenerateCalendarToken, RevokeCalendarToken};
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use domain::UserRepoError;

use crate::auth::AuthUser;
use crate::dto::{CalendarTokenResponseDto, ErrorResponseDto};
use crate::state::AppState;

fn failure(error: UserRepoError) -> Response {
    let UserRepoError::Repository(message) = error;
    eprintln!("calendar token repository failed: {message}");
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorResponseDto {
            message: "internal server error".to_string(),
        }),
    )
        .into_response()
}

#[utoipa::path(
    get,
    path = "/users/me/calendar-token",
    tag = "users",
    summary = "Whether my calendar feed is on, and its token",
    description = "Never turns the feed on by itself, a `null` token means it is off. Build the feed address yourself as `{api address}/calendar/{token}.ics`.",
    responses(
        (status = 200, body = CalendarTokenResponseDto),
        (status = 401, body = ErrorResponseDto),
    )
)]
pub async fn get_calendar_token(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Response {
    match GetCalendarToken::new(state.user_repo.clone())
        .execute(user_id)
        .await
    {
        Ok(token) => (StatusCode::OK, Json(CalendarTokenResponseDto { token })).into_response(),
        Err(error) => failure(error),
    }
}

#[utoipa::path(
    post,
    path = "/users/me/calendar-token",
    tag = "users",
    summary = "Turn the calendar feed on, or make a new token",
    description = "Turns the feed on with a fresh token the first time, and replaces it every later time. Whatever calendar app was reading an old address stops working until it is given the new one.",
    responses(
        (status = 200, body = CalendarTokenResponseDto),
        (status = 401, body = ErrorResponseDto),
    )
)]
pub async fn regenerate_calendar_token(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Response {
    match RegenerateCalendarToken::new(state.user_repo.clone())
        .execute(user_id)
        .await
    {
        Ok(token) => (
            StatusCode::OK,
            Json(CalendarTokenResponseDto { token: Some(token) }),
        )
            .into_response(),
        Err(error) => failure(error),
    }
}

#[utoipa::path(
    delete,
    path = "/users/me/calendar-token",
    tag = "users",
    summary = "Turn off my calendar feed",
    description = "The feed address stops answering at once. Nothing else about the account changes.",
    responses(
        (status = 204),
        (status = 401, body = ErrorResponseDto),
    )
)]
pub async fn revoke_calendar_token(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Response {
    match RevokeCalendarToken::new(state.user_repo.clone())
        .execute(user_id)
        .await
    {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => failure(error),
    }
}
