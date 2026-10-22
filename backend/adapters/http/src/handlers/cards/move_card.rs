use application::MoveCard;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{ErrorResponseDto, MoveCardRequestDto};
use crate::state::AppState;

#[utoipa::path(
    post,
    path = "/cards/{id}/move",
    tag = "cards",
    summary = "Move a card",
    description = "Places the card at a zero based index in a list of the same board. An index past the end places it last.",
    params(("id" = Uuid, Path, description = "Card id")),
    request_body = MoveCardRequestDto,
    responses(
        (status = 204, description = "Card moved"),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
        (status = 409, description = "Card limit reached in the target list", body = ErrorResponseDto),
    )
)]
pub async fn move_card(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<MoveCardRequestDto>,
) -> Response {
    let use_case = MoveCard::new(state.card_repo.clone());

    match use_case
        .execute(user_id, id, payload.list_id, payload.index as usize)
        .await
    {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => boards_error_response(error),
    }
}
