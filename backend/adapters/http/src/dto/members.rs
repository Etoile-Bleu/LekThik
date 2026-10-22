use domain::boards::{Invitation, Member, Role};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;
use validator::Validate;

#[derive(Serialize, ToSchema)]
pub struct MemberDto {
    pub user_id: Uuid,
    pub username: String,
    pub email: String,
    /// One of owner, admin, writer, reader.
    pub role: String,
    pub joined_at: String,
}

impl From<Member> for MemberDto {
    fn from(member: Member) -> Self {
        Self {
            user_id: member.user_id,
            username: member.username,
            email: member.email,
            role: member.role.as_str().to_string(),
            joined_at: member.joined_at,
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct InvitationDto {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub workspace_name: String,
    pub email: String,
    /// One of admin, writer, reader.
    pub role: String,
    pub invited_by: String,
    /// One of pending, accepted, declined, revoked.
    pub status: String,
    pub created_at: String,
    pub expires_at: String,
    pub expired: bool,
}

impl From<Invitation> for InvitationDto {
    fn from(invitation: Invitation) -> Self {
        Self {
            id: invitation.id,
            workspace_id: invitation.workspace_id,
            workspace_name: invitation.workspace_name,
            email: invitation.email,
            role: invitation.role.as_str().to_string(),
            invited_by: invitation.invited_by,
            status: invitation.status.as_str().to_string(),
            created_at: invitation.created_at,
            expires_at: invitation.expires_at,
            expired: invitation.expired,
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct MembersResponseDto {
    /// Role of the signed in user in this workspace.
    pub role: String,
    pub members: Vec<MemberDto>,
    /// Pending invitations, only returned to admins and the owner.
    pub invitations: Vec<InvitationDto>,
}

impl MembersResponseDto {
    pub fn new(role: Role, members: Vec<Member>, invitations: Vec<Invitation>) -> Self {
        Self {
            role: role.as_str().to_string(),
            members: members.into_iter().map(Into::into).collect(),
            invitations: invitations.into_iter().map(Into::into).collect(),
        }
    }
}

#[derive(Deserialize, Validate, ToSchema)]
pub struct InviteMemberRequestDto {
    #[validate(length(min = 3, max = 254))]
    pub email: String,
    #[validate(length(min = 1, max = 16))]
    pub role: String,
}

#[derive(Deserialize, Validate, ToSchema)]
pub struct ChangeRoleRequestDto {
    #[validate(length(min = 1, max = 16))]
    pub role: String,
}
