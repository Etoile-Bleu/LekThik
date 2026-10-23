use application::DuplicateCard;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{CardSummaryDto, ErrorResponseDto};
use crate::state::AppState;

#[utoipa::path(
    post,
    path = "/cards/{id}/duplicate",
    tag = "cards",
    summary = "Duplicate a card",
    description = "Copies the card right after the original, in the same list, with its description, due date, labels and assignees. The title gets \" (copy)\" added. Writers and above can do it, and a list holds up to 500 cards.",
    params(("id" = Uuid, Path, description = "Card id")),
    responses(
        (status = 201, body = CardSummaryDto),
        (status = 401, body = ErrorResponseDto),
        (status = 403, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
        (status = 409, description = "Card limit reached", body = ErrorResponseDto),
    )
)]
pub async fn duplicate_card(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let use_case = DuplicateCard::new(state.card_repo.clone());

    match use_case.execute(user_id, id).await {
        Ok(card) => (StatusCode::CREATED, Json(CardSummaryDto::from(card))).into_response(),
        Err(error) => boards_error_response(error),
    }
}
