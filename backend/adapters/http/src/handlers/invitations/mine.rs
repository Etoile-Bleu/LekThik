use application::{GetMyInvitation, ListMyInvitations};
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{ErrorResponseDto, InvitationDto};
use crate::state::AppState;

#[utoipa::path(
    get,
    path = "/invitations",
    tag = "invitations",
    summary = "List my pending invitations",
    description = "Returns the open invitations sent to the email address of the signed in user.",
    responses(
        (status = 200, body = Vec<InvitationDto>),
        (status = 401, body = ErrorResponseDto),
    )
)]
pub async fn list_my_invitations(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Response {
    let use_case = ListMyInvitations::new(state.user_repo.clone(), state.invitation_repo.clone());

    match use_case.execute(user_id).await {
        Ok(invitations) => {
            let body: Vec<InvitationDto> = invitations.into_iter().map(Into::into).collect();
            (StatusCode::OK, Json(body)).into_response()
        }
        Err(error) => boards_error_response(error),
    }
}

#[utoipa::path(
    get,
    path = "/invitations/{id}",
    tag = "invitations",
    summary = "Read an invitation sent to me",
    description = "Returns the invitation when it was sent to the email address of the signed in user, 404 otherwise. Used by the page the invitation email links to.",
    params(("id" = Uuid, Path, description = "Invitation id")),
    responses(
        (status = 200, body = InvitationDto),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn get_my_invitation(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let use_case = GetMyInvitation::new(state.user_repo.clone(), state.invitation_repo.clone());

    match use_case.execute(user_id, id).await {
        Ok(invitation) => (StatusCode::OK, Json(InvitationDto::from(invitation))).into_response(),
        Err(error) => boards_error_response(error),
    }
}
