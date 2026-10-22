use async_trait::async_trait;
use uuid::Uuid;

use super::board::BoardSummary;
use super::error::BoardsError;
use super::role::Role;
use super::templates::BoardTemplate;
use super::text::Title;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Workspace {
    pub id: Uuid,
    pub name: String,
    pub role: Role,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceWithBoards {
    pub workspace: Workspace,
    pub boards: Vec<BoardSummary>,
}

#[cfg_attr(feature = "test-utils", mockall::automock)]
#[async_trait]
pub trait WorkspaceRepo: Send + Sync {
    async fn create(
        &self,
        user_id: Uuid,
        name: Title,
        boards: Vec<&'static BoardTemplate>,
    ) -> Result<WorkspaceWithBoards, BoardsError>;
    async fn list_with_boards(
        &self,
        user_id: Uuid,
    ) -> Result<Vec<WorkspaceWithBoards>, BoardsError>;
    async fn rename(&self, user_id: Uuid, id: Uuid, name: Title) -> Result<Workspace, BoardsError>;
    async fn delete(&self, user_id: Uuid, id: Uuid) -> Result<(), BoardsError>;
}
