use async_trait::async_trait;
use uuid::Uuid;

use super::error::BoardsError;
use super::role::Role;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InvitationStatus {
    Pending,
    Accepted,
    Declined,
    Revoked,
}

impl InvitationStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            InvitationStatus::Pending => "pending",
            InvitationStatus::Accepted => "accepted",
            InvitationStatus::Declined => "declined",
            InvitationStatus::Revoked => "revoked",
        }
    }

    pub fn parse(value: &str) -> Option<InvitationStatus> {
        match value {
            "pending" => Some(InvitationStatus::Pending),
            "accepted" => Some(InvitationStatus::Accepted),
            "declined" => Some(InvitationStatus::Declined),
            "revoked" => Some(InvitationStatus::Revoked),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Invitation {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub workspace_name: String,
    pub email: String,
    pub role: Role,
    pub invited_by: String,
    pub status: InvitationStatus,
    pub created_at: String,
    pub expires_at: String,
    pub expired: bool,
}

impl Invitation {
    pub fn is_open(&self) -> bool {
        self.status == InvitationStatus::Pending && !self.expired
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewInvitation {
    pub workspace_id: Uuid,
    pub email: String,
    pub role: Role,
    pub invited_by: Uuid,
}

#[cfg_attr(feature = "test-utils", mockall::automock)]
#[async_trait]
pub trait InvitationRepo: Send + Sync {
    async fn create(&self, invitation: NewInvitation) -> Result<Invitation, BoardsError>;
    async fn find(&self, id: Uuid) -> Result<Option<Invitation>, BoardsError>;
    async fn list_pending_for_workspace(
        &self,
        workspace_id: Uuid,
    ) -> Result<Vec<Invitation>, BoardsError>;
    async fn list_pending_for_email(&self, email: &str) -> Result<Vec<Invitation>, BoardsError>;
    async fn revoke(&self, workspace_id: Uuid, id: Uuid) -> Result<(), BoardsError>;
    async fn accept(&self, id: Uuid, user_id: Uuid) -> Result<Invitation, BoardsError>;
    async fn decline(&self, id: Uuid) -> Result<Invitation, BoardsError>;
}
