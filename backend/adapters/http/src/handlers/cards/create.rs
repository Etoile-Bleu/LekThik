use application::CreateCard;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{CardSummaryDto, CreateCardRequestDto, ErrorResponseDto};
use crate::state::AppState;

#[utoipa::path(
    post,
    path = "/lists/{id}/cards",
    tag = "cards",
    summary = "Create a card",
    description = "Appends a card to the list. A list holds up to 500 cards.",
    params(("id" = Uuid, Path, description = "List id")),
    request_body = CreateCardRequestDto,
    responses(
        (status = 201, body = CardSummaryDto),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
        (status = 409, description = "Card limit reached", body = ErrorResponseDto),
    )
)]
pub async fn create_card(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(list_id): Path<Uuid>,
    Json(payload): Json<CreateCardRequestDto>,
) -> Response {
    let use_case = CreateCard::new(state.card_repo.clone());

    match use_case.execute(user_id, list_id, &payload.title).await {
        Ok(card) => (StatusCode::CREATED, Json(CardSummaryDto::from(card))).into_response(),
        Err(error) => boards_error_response(error),
    }
}
