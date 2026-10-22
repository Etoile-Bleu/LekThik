use async_trait::async_trait;
use uuid::Uuid;

use super::error::BoardsError;
use super::label_style::{LabelColor, Priority};
use super::text::Title;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Label {
    pub id: Uuid,
    pub board_id: Uuid,
    pub name: String,
    pub color: LabelColor,
    pub priority: Priority,
}

#[derive(Debug, Clone, Default)]
pub struct LabelUpdate {
    pub name: Option<Title>,
    pub color: Option<LabelColor>,
    pub priority: Option<Priority>,
}

#[cfg_attr(feature = "test-utils", mockall::automock)]
#[async_trait]
pub trait LabelRepo: Send + Sync {
    async fn create(
        &self,
        user_id: Uuid,
        board_id: Uuid,
        name: Title,
        color: LabelColor,
        priority: Priority,
    ) -> Result<Label, BoardsError>;
    async fn update(
        &self,
        user_id: Uuid,
        id: Uuid,
        update: LabelUpdate,
    ) -> Result<Label, BoardsError>;
    async fn delete(&self, user_id: Uuid, id: Uuid) -> Result<(), BoardsError>;
}
