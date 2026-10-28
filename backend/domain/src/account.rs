use async_trait::async_trait;
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
pub struct ExportProfile {
    pub id: Uuid,
    pub email: String,
    pub username: String,
    pub email_verified: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExportMembership {
    pub workspace: String,
    pub role: String,
    pub joined_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExportAssignment {
    pub workspace: String,
    pub board: String,
    pub card: String,
    pub assigned_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExportComment {
    pub workspace: String,
    pub board: String,
    pub card: String,
    pub body: String,
    pub created_at: String,
    pub edited_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExportVote {
    pub workspace: String,
    pub board: String,
    pub question: String,
    pub option: Option<String>,
    pub voted_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AccountExport {
    pub generated_at: String,
    pub profile: ExportProfile,
    pub preferences: Option<serde_json::Value>,
    pub memberships: Vec<ExportMembership>,
    pub assigned_cards: Vec<ExportAssignment>,
    pub comments: Vec<ExportComment>,
    pub poll_votes: Vec<ExportVote>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct OwnedWorkspace {
    pub id: Uuid,
    pub name: String,
    pub other_members: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum AccountError {
    #[error("{0}")]
    Invalid(String),
    #[error("wrong password")]
    WrongPassword,
    #[error("account not found")]
    NotFound,
    #[error("some workspaces still have other members")]
    Blocked(Vec<OwnedWorkspace>),
    #[error("repository error: {0}")]
    Repository(String),
}

#[cfg_attr(feature = "test-utils", mockall::automock)]
#[async_trait]
pub trait AccountRepo: Send + Sync {
    async fn export(&self, user_id: Uuid) -> Result<AccountExport, AccountError>;
    async fn delete(
        &self,
        user_id: Uuid,
        delete_owned_workspaces: bool,
    ) -> Result<(), AccountError>;
}
