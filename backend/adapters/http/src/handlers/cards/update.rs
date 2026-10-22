use application::UpdateCard;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{CardResponseDto, ErrorResponseDto, UpdateCardRequestDto};
use crate::state::AppState;

#[utoipa::path(
    patch,
    path = "/cards/{id}",
    tag = "cards",
    summary = "Update a card",
    description = "Changes the title, the description and or the due date. Fields left out are kept as they are, a null due date clears it.",
    params(("id" = Uuid, Path, description = "Card id")),
    request_body = UpdateCardRequestDto,
    responses(
        (status = 200, body = CardResponseDto),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn update_card(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateCardRequestDto>,
) -> Response {
    let use_case = UpdateCard::new(state.card_repo.clone());

    match use_case
        .execute(
            user_id,
            id,
            payload.title.as_deref(),
            payload.description.as_deref(),
            payload.due_date.as_ref().map(Option::as_deref),
        )
        .await
    {
        Ok(card) => (StatusCode::OK, Json(CardResponseDto::from(card))).into_response(),
        Err(error) => boards_error_response(error),
    }
}
