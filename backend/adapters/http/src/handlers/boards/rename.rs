use application::RenameBoard;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{BoardResponseDto, ErrorResponseDto, NameRequestDto};
use crate::state::AppState;

#[utoipa::path(
    patch,
    path = "/boards/{id}",
    tag = "boards",
    summary = "Rename a board",
    params(("id" = Uuid, Path, description = "Board id")),
    request_body = NameRequestDto,
    responses(
        (status = 200, body = BoardResponseDto),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn rename_board(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<NameRequestDto>,
) -> Response {
    let use_case = RenameBoard::new(state.board_repo.clone());

    match use_case.execute(user_id, id, &payload.name).await {
        Ok(board) => (StatusCode::OK, Json(BoardResponseDto::from(board))).into_response(),
        Err(error) => boards_error_response(error),
    }
}
