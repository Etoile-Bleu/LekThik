use async_trait::async_trait;
use uuid::Uuid;

use super::error::BoardsError;
use super::field::{CardFieldValue, Field};
use super::label::Label;
use super::layout::PanelPlacement;
use super::list::ListWithCards;
use super::look::BoardLook;
use super::role::Role;
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

/// A workspace member as the board needs them: enough to draw an avatar and to assign.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BoardMember {
    pub user_id: Uuid,
    pub username: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BoardView {
    pub board: Board,
    pub role: Role,
    pub look: BoardLook,
    pub members: Vec<BoardMember>,
    pub lists: Vec<ListWithCards>,
    pub labels: Vec<Label>,
    pub fields: Vec<Field>,
    pub field_values: Vec<CardFieldValue>,
}

#[cfg_attr(feature = "test-utils", mockall::automock)]
#[async_trait]
pub trait BoardRepo: Send + Sync {
    async fn create(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        name: Title,
        template: Option<&'static BoardTemplate>,
    ) -> Result<Board, BoardsError>;
    async fn get_view(&self, user_id: Uuid, id: Uuid) -> Result<BoardView, BoardsError>;
    async fn rename(&self, user_id: Uuid, id: Uuid, name: Title) -> Result<Board, BoardsError>;
    async fn delete(&self, user_id: Uuid, id: Uuid) -> Result<(), BoardsError>;
    async fn set_look(
        &self,
        user_id: Uuid,
        id: Uuid,
        look: BoardLook,
    ) -> Result<BoardLook, BoardsError>;
    /// Stores where panels sit on the free layout. Panels that are not named keep their place.
    async fn set_layout(
        &self,
        user_id: Uuid,
        id: Uuid,
        items: Vec<PanelPlacement>,
    ) -> Result<(), BoardsError>;
}
