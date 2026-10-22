use application::GetCard;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{CardResponseDto, ErrorResponseDto};
use crate::state::AppState;

#[utoipa::path(
    get,
    path = "/cards/{id}",
    tag = "cards",
    summary = "Get a card",
    description = "Returns the card with its full description.",
    params(("id" = Uuid, Path, description = "Card id")),
    responses(
        (status = 200, body = CardResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn get_card(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let use_case = GetCard::new(state.card_repo.clone());

    match use_case.execute(user_id, id).await {
        Ok(card) => (StatusCode::OK, Json(CardResponseDto::from(card))).into_response(),
        Err(error) => boards_error_response(error),
    }
}
