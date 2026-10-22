use application::DeleteCard;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::ErrorResponseDto;
use crate::state::AppState;

#[utoipa::path(
    delete,
    path = "/cards/{id}",
    tag = "cards",
    summary = "Delete a card",
    params(("id" = Uuid, Path, description = "Card id")),
    responses(
        (status = 204, description = "Card deleted"),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn delete_card(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let use_case = DeleteCard::new(state.card_repo.clone());

    match use_case.execute(user_id, id).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => boards_error_response(error),
    }
}
