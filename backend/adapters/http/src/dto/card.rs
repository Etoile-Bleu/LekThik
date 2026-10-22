use domain::boards::{Card, CardSummary};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Serialize, ToSchema)]
pub struct CardSummaryDto {
    pub id: Uuid,
    pub list_id: Uuid,
    pub title: String,
    pub has_description: bool,
    pub label_ids: Vec<Uuid>,
}

impl From<CardSummary> for CardSummaryDto {
    fn from(card: CardSummary) -> Self {
        Self {
            id: card.id,
            list_id: card.list_id,
            title: card.title,
            has_description: card.has_description,
            label_ids: card.label_ids,
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct CardResponseDto {
    pub id: Uuid,
    pub list_id: Uuid,
    pub title: String,
    pub description: String,
    pub label_ids: Vec<Uuid>,
}

impl From<Card> for CardResponseDto {
    fn from(card: Card) -> Self {
        Self {
            id: card.id,
            list_id: card.list_id,
            title: card.title,
            description: card.description,
            label_ids: card.label_ids,
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateCardRequestDto {
    pub title: String,
}

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateCardRequestDto {
    pub title: Option<String>,
    pub description: Option<String>,
}

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct MoveCardRequestDto {
    pub list_id: Uuid,
    pub index: u32,
}

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SetCardLabelsRequestDto {
    pub label_ids: Vec<Uuid>,
}

#[derive(Serialize, ToSchema)]
pub struct CardLabelsResponseDto {
    pub label_ids: Vec<Uuid>,
}
