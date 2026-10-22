use application::RespondToInvitation;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use domain::boards::Invitation;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{ErrorResponseDto, InvitationDto};
use crate::events::{Change, client_origin};
use crate::state::AppState;

fn announce(
    state: &AppState,
    headers: &HeaderMap,
    invitation: &Invitation,
    joined_user: Option<Uuid>,
) {
    let origin = client_origin(headers);
    state.events.publish(
        Change::Members {
            workspace_id: invitation.workspace_id,
            user_id: joined_user,
        },
        origin.clone(),
    );
    state.events.publish(
        Change::Invitations {
            email: invitation.email.clone(),
        },
        origin,
    );
}

#[utoipa::path(
    post,
    path = "/invitations/{id}/accept",
    tag = "invitations",
    summary = "Accept an invitation",
    description = "Adds the signed in user to the workspace with the invited role. Only the invited email address, once verified, can accept.",
    params(("id" = Uuid, Path, description = "Invitation id")),
    responses(
        (status = 200, body = InvitationDto),
        (status = 401, body = ErrorResponseDto),
        (status = 403, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
        (status = 409, description = "Expired, revoked or already answered", body = ErrorResponseDto),
    )
)]
pub async fn accept_invitation(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Response {
    let use_case = RespondToInvitation::new(state.user_repo.clone(), state.invitation_repo.clone());

    match use_case.accept(user_id, id).await {
        Ok(invitation) => {
            announce(&state, &headers, &invitation, Some(user_id));
            (StatusCode::OK, Json(InvitationDto::from(invitation))).into_response()
        }
        Err(error) => boards_error_response(error),
    }
}

#[utoipa::path(
    post,
    path = "/invitations/{id}/decline",
    tag = "invitations",
    summary = "Decline an invitation",
    params(("id" = Uuid, Path, description = "Invitation id")),
    responses(
        (status = 200, body = InvitationDto),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
        (status = 409, description = "Expired, revoked or already answered", body = ErrorResponseDto),
    )
)]
pub async fn decline_invitation(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Response {
    let use_case = RespondToInvitation::new(state.user_repo.clone(), state.invitation_repo.clone());

    match use_case.decline(user_id, id).await {
        Ok(invitation) => {
            announce(&state, &headers, &invitation, None);
            (StatusCode::OK, Json(InvitationDto::from(invitation))).into_response()
        }
        Err(error) => boards_error_response(error),
    }
}
