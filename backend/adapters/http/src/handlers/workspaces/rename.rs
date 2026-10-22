use application::RenameWorkspace;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{ErrorResponseDto, NameRequestDto, WorkspaceResponseDto};
use crate::state::AppState;

#[utoipa::path(
    patch,
    path = "/workspaces/{id}",
    tag = "workspaces",
    summary = "Rename a workspace",
    params(("id" = Uuid, Path, description = "Workspace id")),
    request_body = NameRequestDto,
    responses(
        (status = 200, body = WorkspaceResponseDto),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn rename_workspace(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<NameRequestDto>,
) -> Response {
    let use_case = RenameWorkspace::new(state.workspace_repo.clone());

    match use_case.execute(user_id, id, &payload.name).await {
        Ok(workspace) => {
            (StatusCode::OK, Json(WorkspaceResponseDto::from(workspace))).into_response()
        }
        Err(error) => boards_error_response(error),
    }
}
