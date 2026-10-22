use application::InviteMember;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use uuid::Uuid;
use validator::Validate;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{ErrorResponseDto, InvitationDto, InviteMemberRequestDto};
use crate::events::{Change, client_origin};
use crate::state::AppState;

#[utoipa::path(
    post,
    path = "/workspaces/{id}/invitations",
    tag = "invitations",
    summary = "Invite someone by email",
    description = "Admins and the owner invite an email address with a role of admin (owner only), writer or reader. The invitee receives an email with a link to accept or decline. Inviting an address that already has a pending invitation renews it and resends the email.",
    params(("id" = Uuid, Path, description = "Workspace id")),
    request_body = InviteMemberRequestDto,
    responses(
        (status = 201, body = InvitationDto),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 403, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
        (status = 409, description = "Already a member or a limit was reached", body = ErrorResponseDto),
    )
)]
pub async fn invite_member(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    Json(payload): Json<InviteMemberRequestDto>,
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

    let use_case = InviteMember::new(
        state.member_repo.clone(),
        state.invitation_repo.clone(),
        state.mailer.clone(),
        state.app_base_url.clone(),
    );

    match use_case
        .execute(user_id, id, &payload.email, &payload.role)
        .await
    {
        Ok(invitation) => {
            let origin = client_origin(&headers);
            state.events.publish(
                Change::Members {
                    workspace_id: id,
                    user_id: None,
                },
                origin.clone(),
            );
            state.events.publish(
                Change::Invitations {
                    email: invitation.email.clone(),
                },
                origin,
            );
            (StatusCode::CREATED, Json(InvitationDto::from(invitation))).into_response()
        }
        Err(error) => boards_error_response(error),
    }
}
