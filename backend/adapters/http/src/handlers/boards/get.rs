use application::GetBoard;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{BoardViewDto, ErrorResponseDto};
use crate::state::AppState;

#[utoipa::path(
    get,
    path = "/boards/{id}",
    tag = "boards",
    summary = "Get a board",
    description = "Returns the board with its lists, the card summaries of each list, and the board's labels.",
    params(("id" = Uuid, Path, description = "Board id")),
    responses(
        (status = 200, body = BoardViewDto),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn get_board(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let use_case = GetBoard::new(state.board_repo.clone());

    match use_case.execute(user_id, id).await {
        Ok(view) => (StatusCode::OK, Json(BoardViewDto::from(view))).into_response(),
        Err(error) => boards_error_response(error),
    }
}
