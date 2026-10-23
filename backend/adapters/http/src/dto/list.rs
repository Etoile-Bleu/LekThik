use domain::boards::{List, ListWithCards, Placement};
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

/// Where a panel sits on the 12 column free layout, in cells from the top left corner.
#[derive(Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct PlacementDto {
    /// Column of the left edge, from 0.
    pub x: u32,
    /// Row of the top edge, from 0.
    pub y: u32,
    /// Width in columns, 1 to 12, and `x + w` is at most 12.
    pub w: u32,
    /// Height in rows, 1 to 100.
    pub h: u32,
}

impl From<Placement> for PlacementDto {
    fn from(placement: Placement) -> Self {
        Self {
            x: u32::from(placement.x),
            y: u32::from(placement.y),
            w: u32::from(placement.w),
            h: u32::from(placement.h),
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct PanelPlacementDto {
    pub id: Uuid,
    #[serde(flatten)]
    pub placement: PlacementDto,
}

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SetLayoutRequestDto {
    /// The panels to place. Panels that are left out keep their place.
    pub items: Vec<PanelPlacementDto>,
}

#[derive(Serialize, ToSchema)]
pub struct ListWithCardsDto {
    pub id: Uuid,
    pub name: String,
    pub wip_limit: Option<u8>,
    pub kind: String,
    #[schema(value_type = Object)]
    pub config: serde_json::Value,
    /// Changes with every new picture of an image block, `null` while it has none.
    pub image_version: Option<i64>,
    /// Where it sits on the free layout, `null` until somebody places it.
    pub layout: Option<PlacementDto>,
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
            image_version: list.image_version,
            layout: list.layout.map(Into::into),
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

#[derive(Serialize, ToSchema)]
pub struct BlockImageResponseDto {
    /// Changes with every upload, so clients know when to fetch the picture again.
    pub image_version: i64,
}
