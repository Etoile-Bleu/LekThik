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
    /// Work in progress limit, `null` when the list has none.
    pub wip_limit: Option<u8>,
    /// `list`, or the kind of block: `calendar`, `agenda`, `note` or `counter`.
    pub kind: String,
    /// The settings of a block, empty for a list.
    #[schema(value_type = Object)]
    pub config: serde_json::Value,
}

impl From<List> for ListResponseDto {
    fn from(list: List) -> Self {
        Self {
            id: list.id,
            board_id: list.board_id,
            name: list.name,
            wip_limit: list.wip_limit,
            kind: list.config.kind().as_str().to_string(),
            config: list.config.to_value(),
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct ListWithCardsDto {
    pub id: Uuid,
    pub name: String,
    pub wip_limit: Option<u8>,
    pub kind: String,
    #[schema(value_type = Object)]
    pub config: serde_json::Value,
    pub cards: Vec<CardSummaryDto>,
}

impl From<ListWithCards> for ListWithCardsDto {
    fn from(list: ListWithCards) -> Self {
        Self {
            id: list.id,
            name: list.name,
            wip_limit: list.wip_limit,
            kind: list.config.kind().as_str().to_string(),
            config: list.config.to_value(),
            cards: list.cards.into_iter().map(Into::into).collect(),
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct MoveListRequestDto {
    pub index: u32,
}

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct WipLimitRequestDto {
    /// Between 1 and 99, or `null` to remove the limit. The field must be present, so an
    /// empty body can never clear a limit by accident.
    #[serde(deserialize_with = "required_nullable")]
    #[schema(value_type = Option<u32>)]
    pub limit: Option<u32>,
}

fn required_nullable<'de, D>(deserializer: D) -> Result<Option<u32>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<u32>::deserialize(deserializer)
}

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateBlockRequestDto {
    /// `calendar`, `agenda`, `note` or `counter`.
    pub kind: String,
    pub name: String,
    /// Settings for the kind. Leave out for the defaults. Unknown settings are refused.
    #[serde(default)]
    #[schema(value_type = Object)]
    pub config: serde_json::Value,
}

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SetBlockConfigRequestDto {
    /// Must match the kind the block was made with.
    pub kind: String,
    #[serde(default)]
    #[schema(value_type = Object)]
    pub config: serde_json::Value,
}
