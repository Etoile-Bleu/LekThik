use application::SetCardAssignees;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{CardAssigneesResponseDto, ErrorResponseDto, SetCardAssigneesRequestDto};
use crate::state::AppState;

#[utoipa::path(
    put,
    path = "/cards/{id}/assignees",
    tag = "cards",
    summary = "Replace the assignees of a card",
    description = "Sets the exact list of people assigned to the card, up to 10. Every one of them must be a member of the card's workspace. Readers cannot change assignees.",
    params(("id" = Uuid, Path, description = "Card id")),
    request_body = SetCardAssigneesRequestDto,
    responses(
        (status = 200, body = CardAssigneesResponseDto),
        (status = 400, description = "Someone in the list is not a member", body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 403, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
        (status = 409, description = "Too many assignees", body = ErrorResponseDto),
    )
)]
pub async fn set_card_assignees(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<SetCardAssigneesRequestDto>,
) -> Response {
    let use_case = SetCardAssignees::new(state.card_repo.clone());

    match use_case.execute(user_id, id, payload.user_ids).await {
        Ok(assignee_ids) => (
            StatusCode::OK,
            Json(CardAssigneesResponseDto { assignee_ids }),
        )
            .into_response(),
        Err(error) => boards_error_response(error),
    }
}
