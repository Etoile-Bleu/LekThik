use async_trait::async_trait;
use uuid::Uuid;

use super::block::BlockConfig;
use super::card::CardSummary;
use super::error::BoardsError;
use super::layout::Placement;
use super::limits::MAX_WIP_LIMIT;
use super::text::Title;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct List {
    pub id: Uuid,
    pub board_id: Uuid,
    pub name: String,
    pub wip_limit: Option<u8>,
    /// What the panel is, with its settings. A list of cards for most.
    pub config: BlockConfig,
}

/// How many cards a list should hold at once, between 1 and 99.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WipLimit(u8);

impl WipLimit {
    pub fn parse(value: u32) -> Result<Self, BoardsError> {
        match u8::try_from(value) {
            Ok(limit) if (1..=MAX_WIP_LIMIT).contains(&limit) => Ok(Self(limit)),
            _ => Err(BoardsError::Invalid(format!(
                "a work in progress limit is between 1 and {MAX_WIP_LIMIT}"
            ))),
        }
    }

    pub fn get(self) -> u8 {
        self.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ListWithCards {
    pub id: Uuid,
    pub name: String,
    pub wip_limit: Option<u8>,
    pub config: BlockConfig,
    /// Changes with every new picture of an image block, `None` while it has none.
    pub image_version: Option<i64>,
    /// Where it sits on the free layout, `None` until somebody places it.
    pub layout: Option<Placement>,
    pub cards: Vec<CardSummary>,
}

#[cfg_attr(feature = "test-utils", mockall::automock)]
#[async_trait]
pub trait ListRepo: Send + Sync {
    async fn create(&self, user_id: Uuid, board_id: Uuid, name: Title)
    -> Result<List, BoardsError>;
    async fn rename(&self, user_id: Uuid, id: Uuid, name: Title) -> Result<List, BoardsError>;
    /// Adds a block (a panel that is not a list of cards) at the end of the board.
    async fn create_block(
        &self,
        user_id: Uuid,
        board_id: Uuid,
        name: Title,
        config: BlockConfig,
    ) -> Result<List, BoardsError>;
    /// Replaces the settings of a block. The kind of a block never changes.
    async fn set_config(
        &self,
        user_id: Uuid,
        id: Uuid,
        config: BlockConfig,
    ) -> Result<List, BoardsError>;
    async fn set_wip_limit(
        &self,
        user_id: Uuid,
        id: Uuid,
        limit: Option<WipLimit>,
    ) -> Result<List, BoardsError>;
    async fn move_to(&self, user_id: Uuid, id: Uuid, index: usize) -> Result<(), BoardsError>;
    async fn delete(&self, user_id: Uuid, id: Uuid) -> Result<(), BoardsError>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_limits_from_one_to_ninety_nine() {
        for value in [1, 5, 99] {
            assert_eq!(WipLimit::parse(value).map(WipLimit::get), Ok(value as u8));
        }
    }

    #[test]
    fn refuses_zero_and_anything_past_the_cap() {
        for value in [0, 100, 256, 1000, u32::MAX] {
            assert!(matches!(
                WipLimit::parse(value),
                Err(BoardsError::Invalid(_))
            ));
        }
    }
}
