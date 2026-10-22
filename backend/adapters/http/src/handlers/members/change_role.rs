use application::ChangeMemberRole;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use uuid::Uuid;
use validator::Validate;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{ChangeRoleRequestDto, ErrorResponseDto, MemberDto};
use crate::events::{Change, client_origin};
use crate::state::AppState;

#[utoipa::path(
    patch,
    path = "/workspaces/{id}/members/{user_id}",
    tag = "members",
    summary = "Change the role of a member",
    description = "Admins and the owner can change the role of members ranked below them, to a role ranked below their own. The owner role is never assigned.",
    params(
        ("id" = Uuid, Path, description = "Workspace id"),
        ("user_id" = Uuid, Path, description = "Member to change"),
    ),
    request_body = ChangeRoleRequestDto,
    responses(
        (status = 200, body = MemberDto),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 403, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn change_member_role(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    headers: HeaderMap,
    Path((id, target_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<ChangeRoleRequestDto>,
) -> Response {
    if let Err(errors) = payload.validate() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponseDto {
                message: errors.to_string(),
            }),
        )
            .into_response();
    }

    let use_case = ChangeMemberRole::new(state.member_repo.clone());

    match use_case
        .execute(user_id, id, target_id, &payload.role)
        .await
    {
        Ok(member) => {
            state.events.publish(
                Change::Members {
                    workspace_id: id,
                    user_id: Some(target_id),
                },
                client_origin(&headers),
            );
            (StatusCode::OK, Json(MemberDto::from(member))).into_response()
        }
        Err(error) => boards_error_response(error),
    }
}
