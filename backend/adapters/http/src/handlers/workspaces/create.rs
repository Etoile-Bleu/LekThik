use application::CreateWorkspace;
use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{CreateNamedRequestDto, ErrorResponseDto, WorkspaceWithBoardsDto};
use crate::events::{Change, client_origin};
use crate::state::AppState;

#[utoipa::path(
    post,
    path = "/workspaces",
    tag = "workspaces",
    summary = "Create a workspace",
    description = "Creates a workspace owned by the signed in user, blank or from a workspace template that also creates its boards. A user can own up to 50 workspaces.",
    request_body = CreateNamedRequestDto,
    responses(
        (status = 201, body = WorkspaceWithBoardsDto),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 409, description = "Workspace limit reached", body = ErrorResponseDto),
    )
)]
pub async fn create_workspace(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    headers: HeaderMap,
    Json(payload): Json<CreateNamedRequestDto>,
) -> Response {
    let use_case = CreateWorkspace::new(state.workspace_repo.clone());

    match use_case
        .execute(user_id, &payload.name, payload.template_id.as_deref())
        .await
    {
        Ok(workspace) => {
            state
                .events
                .publish(Change::User { user_id }, client_origin(&headers));
            (
                StatusCode::CREATED,
                Json(WorkspaceWithBoardsDto::from(workspace)),
            )
                .into_response()
        }
        Err(error) => boards_error_response(error),
    }
}
