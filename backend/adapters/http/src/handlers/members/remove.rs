use application::RemoveMember;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::ErrorResponseDto;
use crate::events::{Change, client_origin};
use crate::state::AppState;

#[utoipa::path(
    delete,
    path = "/workspaces/{id}/members/{user_id}",
    tag = "members",
    summary = "Remove a member or leave a workspace",
    description = "Admins and the owner remove members ranked below them. Any member can remove themselves to leave, except the owner. Access is cut immediately, including on open event streams.",
    params(
        ("id" = Uuid, Path, description = "Workspace id"),
        ("user_id" = Uuid, Path, description = "Member to remove, or yourself to leave"),
    ),
    responses(
        (status = 204),
        (status = 401, body = ErrorResponseDto),
        (status = 403, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
        (status = 409, description = "The owner cannot leave", body = ErrorResponseDto),
    )
)]
pub async fn remove_member(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    headers: HeaderMap,
    Path((id, target_id)): Path<(Uuid, Uuid)>,
) -> Response {
    let use_case = RemoveMember::new(state.member_repo.clone());

    match use_case.execute(user_id, id, target_id).await {
        Ok(()) => {
            state.events.publish(
                Change::Members {
                    workspace_id: id,
                    user_id: Some(target_id),
                },
                client_origin(&headers),
            );
            StatusCode::NO_CONTENT.into_response()
        }
        Err(error) => boards_error_response(error),
    }
}
