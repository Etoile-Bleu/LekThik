use async_trait::async_trait;
use uuid::Uuid;

use super::due_date::DueDate;
use super::error::BoardsError;
use super::text::{Description, Title};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CardSummary {
    pub id: Uuid,
    pub list_id: Uuid,
    pub title: String,
    pub has_description: bool,
    /// The start of the description, for cards that show a preview.
    pub description_preview: String,
    pub label_ids: Vec<Uuid>,
    pub assignee_ids: Vec<Uuid>,
    pub due_date: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Card {
    pub id: Uuid,
    pub list_id: Uuid,
    pub title: String,
    pub description: String,
    pub label_ids: Vec<Uuid>,
    pub assignee_ids: Vec<Uuid>,
    pub due_date: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct CardUpdate {
    pub title: Option<Title>,
    pub description: Option<Description>,
    /// `None` keeps the date, `Some(None)` clears it, `Some(Some(day))` sets it.
    pub due_date: Option<Option<DueDate>>,
}

#[cfg_attr(feature = "test-utils", mockall::automock)]
#[async_trait]
pub trait CardRepo: Send + Sync {
    async fn create(
        &self,
        user_id: Uuid,
        list_id: Uuid,
        title: Title,
    ) -> Result<CardSummary, BoardsError>;
    async fn get(&self, user_id: Uuid, id: Uuid) -> Result<Card, BoardsError>;
    async fn update(
        &self,
        user_id: Uuid,
        id: Uuid,
        update: CardUpdate,
    ) -> Result<Card, BoardsError>;
    async fn move_to(
        &self,
        user_id: Uuid,
        id: Uuid,
        list_id: Uuid,
        index: usize,
    ) -> Result<(), BoardsError>;
    async fn delete(&self, user_id: Uuid, id: Uuid) -> Result<(), BoardsError>;
    async fn set_labels(
        &self,
        user_id: Uuid,
        id: Uuid,
        label_ids: Vec<Uuid>,
    ) -> Result<Vec<Uuid>, BoardsError>;
    async fn set_assignees(
        &self,
        user_id: Uuid,
        id: Uuid,
        assignee_ids: Vec<Uuid>,
    ) -> Result<Vec<Uuid>, BoardsError>;
}
