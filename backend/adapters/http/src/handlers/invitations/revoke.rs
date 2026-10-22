use application::RevokeInvitation;
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
    path = "/workspaces/{id}/invitations/{invitation_id}",
    tag = "invitations",
    summary = "Revoke a pending invitation",
    params(
        ("id" = Uuid, Path, description = "Workspace id"),
        ("invitation_id" = Uuid, Path, description = "Invitation id"),
    ),
    responses(
        (status = 204),
        (status = 401, body = ErrorResponseDto),
        (status = 403, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn revoke_invitation(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    headers: HeaderMap,
    Path((id, invitation_id)): Path<(Uuid, Uuid)>,
) -> Response {
    let invitee = state
        .invitation_repo
        .find(invitation_id)
        .await
        .ok()
        .flatten()
        .filter(|invitation| invitation.workspace_id == id)
        .map(|invitation| invitation.email);

    let use_case = RevokeInvitation::new(state.member_repo.clone(), state.invitation_repo.clone());

    match use_case.execute(user_id, id, invitation_id).await {
        Ok(()) => {
            let origin = client_origin(&headers);
            state.events.publish(
                Change::Members {
                    workspace_id: id,
                    user_id: None,
                },
                origin.clone(),
            );
            if let Some(email) = invitee {
                state.events.publish(Change::Invitations { email }, origin);
            }
            StatusCode::NO_CONTENT.into_response()
        }
        Err(error) => boards_error_response(error),
    }
}
