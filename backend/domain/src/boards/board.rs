use async_trait::async_trait;
use uuid::Uuid;

use super::error::BoardsError;
use super::label::Label;
use super::list::ListWithCards;
use super::templates::BoardTemplate;
use super::text::Title;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Board {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BoardSummary {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BoardView {
    pub board: Board,
    pub lists: Vec<ListWithCards>,
    pub labels: Vec<Label>,
}

#[cfg_attr(feature = "test-utils", mockall::automock)]
#[async_trait]
pub trait BoardRepo: Send + Sync {
    async fn create(
        &self,
        owner_id: Uuid,
        workspace_id: Uuid,
        name: Title,
        template: Option<&'static BoardTemplate>,
    ) -> Result<Board, BoardsError>;
    async fn get_view(&self, owner_id: Uuid, id: Uuid) -> Result<BoardView, BoardsError>;
    async fn rename(&self, owner_id: Uuid, id: Uuid, name: Title) -> Result<Board, BoardsError>;
    async fn delete(&self, owner_id: Uuid, id: Uuid) -> Result<(), BoardsError>;
}
