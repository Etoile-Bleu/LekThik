use application::SetBoardLook;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{BoardLookDto, ErrorResponseDto};
use crate::state::AppState;

#[utoipa::path(
    put,
    path = "/boards/{id}/look",
    tag = "boards",
    summary = "Set the look of a board",
    description = "Picks the background tint and the accent colour of a board from a fixed set of presets, shared with everybody who can open the board. Writers and above can change it.",
    params(("id" = Uuid, Path, description = "Board id")),
    request_body = BoardLookDto,
    responses(
        (status = 200, body = BoardLookDto),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 403, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn set_board_look(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<BoardLookDto>,
) -> Response {
    let use_case = SetBoardLook::new(state.board_repo.clone());

    match use_case
        .execute(user_id, id, &payload.background, &payload.accent)
        .await
    {
        Ok(look) => (StatusCode::OK, Json(BoardLookDto::from(look))).into_response(),
        Err(error) => boards_error_response(error),
    }
}
