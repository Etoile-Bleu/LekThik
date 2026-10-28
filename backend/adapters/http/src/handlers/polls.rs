use application::{VoteInPoll, WithdrawVote};
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{ErrorResponseDto, VoteRequestDto};
use crate::state::AppState;

#[utoipa::path(
    put,
    path = "/lists/{id}/poll/vote",
    tag = "polls",
    summary = "Vote in a poll",
    description = "Casts the vote of the signed in member, or moves it to another option. One vote per person. Any member of the workspace may vote, readers included. A closed poll answers 409.",
    params(("id" = Uuid, Path, description = "Poll block id")),
    request_body = VoteRequestDto,
    responses(
        (status = 204, description = "Vote recorded"),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
        (status = 409, description = "The poll is closed", body = ErrorResponseDto),
    )
)]
pub async fn vote_in_poll(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(list_id): Path<Uuid>,
    Json(payload): Json<VoteRequestDto>,
) -> Response {
    let use_case = VoteInPoll::new(state.poll_repo.clone());

    match use_case.execute(user_id, list_id, &payload.option_id).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => boards_error_response(error),
    }
}

#[utoipa::path(
    delete,
    path = "/lists/{id}/poll/vote",
    tag = "polls",
    summary = "Withdraw a vote",
    description = "Removes the vote of the signed in member. Nothing happens if there is none. A closed poll answers 409.",
    params(("id" = Uuid, Path, description = "Poll block id")),
    responses(
        (status = 204, description = "Vote withdrawn"),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
        (status = 409, description = "The poll is closed", body = ErrorResponseDto),
    )
)]
pub async fn withdraw_vote(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(list_id): Path<Uuid>,
) -> Response {
    let use_case = WithdrawVote::new(state.poll_repo.clone());

    match use_case.execute(user_id, list_id).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => boards_error_response(error),
    }
}
