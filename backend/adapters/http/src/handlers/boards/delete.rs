use application::DeleteBoard;
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
    path = "/boards/{id}",
    tag = "boards",
    summary = "Delete a board",
    description = "Deletes the board with all of its lists, cards and labels.",
    params(("id" = Uuid, Path, description = "Board id")),
    responses(
        (status = 204, description = "Board deleted"),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn delete_board(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let use_case = DeleteBoard::new(state.board_repo.clone());

    match use_case.execute(user_id, id).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => boards_error_response(error),
    }
}
