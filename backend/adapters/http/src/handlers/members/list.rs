use application::ListMembers;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{ErrorResponseDto, MembersResponseDto};
use crate::state::AppState;

#[utoipa::path(
    get,
    path = "/workspaces/{id}/members",
    tag = "members",
    summary = "List the members of a workspace",
    description = "Returns every member with their role. Admins and the owner also get the pending invitations. Anybody who is not a member gets 404.",
    params(("id" = Uuid, Path, description = "Workspace id")),
    responses(
        (status = 200, body = MembersResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn list_members(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let use_case = ListMembers::new(state.member_repo.clone(), state.invitation_repo.clone());

    match use_case.execute(user_id, id).await {
        Ok(overview) => (
            StatusCode::OK,
            Json(MembersResponseDto::new(
                overview.role,
                overview.members,
                overview.invitations,
            )),
        )
            .into_response(),
        Err(error) => boards_error_response(error),
    }
}
