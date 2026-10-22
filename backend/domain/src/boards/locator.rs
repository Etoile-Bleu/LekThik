use async_trait::async_trait;
use uuid::Uuid;

use super::error::BoardsError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Target {
    Workspace(Uuid),
    Board(Uuid),
    List(Uuid),
    Card(Uuid),
    Label(Uuid),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Located {
    pub workspace_id: Uuid,
    pub board_id: Option<Uuid>,
}

/// Finds which workspace and board a resource belongs to, without any access
/// check. It only feeds change notifications and never returns resource data.
#[cfg_attr(feature = "test-utils", mockall::automock)]
#[async_trait]
pub trait Locator: Send + Sync {
    async fn locate(&self, target: Target) -> Result<Option<Located>, BoardsError>;
}
