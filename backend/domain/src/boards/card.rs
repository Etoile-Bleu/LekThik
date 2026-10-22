use async_trait::async_trait;
use uuid::Uuid;

use super::error::BoardsError;
use super::text::{Description, Title};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CardSummary {
    pub id: Uuid,
    pub list_id: Uuid,
    pub title: String,
    pub has_description: bool,
    pub label_ids: Vec<Uuid>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Card {
    pub id: Uuid,
    pub list_id: Uuid,
    pub title: String,
    pub description: String,
    pub label_ids: Vec<Uuid>,
}

#[derive(Debug, Clone, Default)]
pub struct CardUpdate {
    pub title: Option<Title>,
    pub description: Option<Description>,
}

#[cfg_attr(feature = "test-utils", mockall::automock)]
#[async_trait]
pub trait CardRepo: Send + Sync {
    async fn create(
        &self,
        owner_id: Uuid,
        list_id: Uuid,
        title: Title,
    ) -> Result<CardSummary, BoardsError>;
    async fn get(&self, owner_id: Uuid, id: Uuid) -> Result<Card, BoardsError>;
    async fn update(
        &self,
        owner_id: Uuid,
        id: Uuid,
        update: CardUpdate,
    ) -> Result<Card, BoardsError>;
    async fn move_to(
        &self,
        owner_id: Uuid,
        id: Uuid,
        list_id: Uuid,
        index: usize,
    ) -> Result<(), BoardsError>;
    async fn delete(&self, owner_id: Uuid, id: Uuid) -> Result<(), BoardsError>;
    async fn set_labels(
        &self,
        owner_id: Uuid,
        id: Uuid,
        label_ids: Vec<Uuid>,
    ) -> Result<Vec<Uuid>, BoardsError>;
}
