use application::SetDoneList;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{BoardResponseDto, ErrorResponseDto, SetDoneListRequestDto};
use crate::state::AppState;

#[utoipa::path(
    put,
    path = "/boards/{id}/done-list",
    tag = "boards",
    summary = "Choose the list that means done, for cycle time",
    description = "Picks which list on this board counts as finished, so cycle time can be \
        measured from a card's last move into it back to when it entered the board. Send \
        `list_id: null` to turn cycle time off. The chosen list must be an actual list on this \
        board, not a block.",
    params(("id" = Uuid, Path, description = "Board id")),
    request_body = SetDoneListRequestDto,
    responses(
        (status = 200, body = BoardResponseDto),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 403, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn set_done_list(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<SetDoneListRequestDto>,
) -> Response {
    let use_case = SetDoneList::new(state.board_repo.clone());

    match use_case.execute(user_id, id, payload.list_id).await {
        Ok(board) => (StatusCode::OK, Json(BoardResponseDto::from(board))).into_response(),
        Err(error) => boards_error_response(error),
    }
}
