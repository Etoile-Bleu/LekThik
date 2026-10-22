use async_trait::async_trait;
use uuid::Uuid;

use super::card::CardSummary;
use super::error::BoardsError;
use super::text::Title;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct List {
    pub id: Uuid,
    pub board_id: Uuid,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ListWithCards {
    pub id: Uuid,
    pub name: String,
    pub cards: Vec<CardSummary>,
}

#[cfg_attr(feature = "test-utils", mockall::automock)]
#[async_trait]
pub trait ListRepo: Send + Sync {
    async fn create(
        &self,
        owner_id: Uuid,
        board_id: Uuid,
        name: Title,
    ) -> Result<List, BoardsError>;
    async fn rename(&self, owner_id: Uuid, id: Uuid, name: Title) -> Result<List, BoardsError>;
    async fn move_to(&self, owner_id: Uuid, id: Uuid, index: usize) -> Result<(), BoardsError>;
    async fn delete(&self, owner_id: Uuid, id: Uuid) -> Result<(), BoardsError>;
}
