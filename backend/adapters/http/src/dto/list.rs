use domain::boards::{List, ListWithCards};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use super::card::CardSummaryDto;

#[derive(Serialize, ToSchema)]
pub struct ListResponseDto {
    pub id: Uuid,
    pub board_id: Uuid,
    pub name: String,
}

impl From<List> for ListResponseDto {
    fn from(list: List) -> Self {
        Self {
            id: list.id,
            board_id: list.board_id,
            name: list.name,
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct ListWithCardsDto {
    pub id: Uuid,
    pub name: String,
    pub cards: Vec<CardSummaryDto>,
}

impl From<ListWithCards> for ListWithCardsDto {
    fn from(list: ListWithCards) -> Self {
        Self {
            id: list.id,
            name: list.name,
            cards: list.cards.into_iter().map(Into::into).collect(),
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct MoveListRequestDto {
    pub index: u32,
}
