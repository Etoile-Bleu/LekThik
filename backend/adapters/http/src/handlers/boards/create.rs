use application::CreateBoard;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{BoardResponseDto, CreateNamedRequestDto, ErrorResponseDto};
use crate::state::AppState;

#[utoipa::path(
    post,
    path = "/workspaces/{id}/boards",
    tag = "boards",
    summary = "Create a board",
    description = "Creates a board in a workspace owned by the signed in user, blank with four priority labels, or filled from a board template. A workspace holds up to 100 boards.",
    params(("id" = Uuid, Path, description = "Workspace id")),
    request_body = CreateNamedRequestDto,
    responses(
        (status = 201, body = BoardResponseDto),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
        (status = 409, description = "Board limit reached", body = ErrorResponseDto),
    )
)]
pub async fn create_board(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(workspace_id): Path<Uuid>,
    Json(payload): Json<CreateNamedRequestDto>,
) -> Response {
    let use_case = CreateBoard::new(state.board_repo.clone());

    match use_case
        .execute(
            user_id,
            workspace_id,
            &payload.name,
            payload.template_id.as_deref(),
        )
        .await
    {
        Ok(board) => (StatusCode::CREATED, Json(BoardResponseDto::from(board))).into_response(),
        Err(error) => boards_error_response(error),
    }
}
