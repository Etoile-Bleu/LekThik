use application::SetCardBlocked;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{CardResponseDto, ErrorResponseDto, SetCardBlockedRequestDto};
use crate::state::AppState;

#[utoipa::path(
    put,
    path = "/cards/{id}/blocked",
    tag = "cards",
    summary = "Flag a card as blocked, or clear the flag",
    description = "Marks a card as blocked, with an optional reason shown next to the flag, or \
        clears it by sending `blocked: false`. Re-blocking an already blocked card keeps its \
        original blocked-since time and only updates the reason.",
    params(("id" = Uuid, Path, description = "Card id")),
    request_body = SetCardBlockedRequestDto,
    responses(
        (status = 200, body = CardResponseDto),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn set_card_blocked(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<SetCardBlockedRequestDto>,
) -> Response {
    let use_case = SetCardBlocked::new(state.card_repo.clone());

    match use_case
        .execute(user_id, id, payload.blocked, payload.reason)
        .await
    {
        Ok(card) => (StatusCode::OK, Json(CardResponseDto::from(card))).into_response(),
        Err(error) => boards_error_response(error),
    }
}
