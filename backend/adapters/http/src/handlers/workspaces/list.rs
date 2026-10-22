use application::ListWorkspaces;
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{ErrorResponseDto, WorkspaceWithBoardsDto};
use crate::state::AppState;

#[utoipa::path(
    get,
    path = "/workspaces",
    tag = "workspaces",
    summary = "List my workspaces",
    description = "Returns every workspace of the signed in user together with its boards.",
    responses(
        (status = 200, body = Vec<WorkspaceWithBoardsDto>),
        (status = 401, body = ErrorResponseDto),
    )
)]
pub async fn list_workspaces(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Response {
    let use_case = ListWorkspaces::new(state.workspace_repo.clone());

    match use_case.execute(user_id).await {
        Ok(workspaces) => {
            let body: Vec<WorkspaceWithBoardsDto> =
                workspaces.into_iter().map(Into::into).collect();
            (StatusCode::OK, Json(body)).into_response()
        }
        Err(error) => boards_error_response(error),
    }
}
