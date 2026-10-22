use domain::boards::{Card, CardSummary};
use serde::{Deserialize, Deserializer, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Serialize, ToSchema)]
pub struct CardSummaryDto {
    pub id: Uuid,
    pub list_id: Uuid,
    pub title: String,
    pub has_description: bool,
    pub label_ids: Vec<Uuid>,
    pub assignee_ids: Vec<Uuid>,
    /// Calendar day, `YYYY-MM-DD`.
    pub due_date: Option<String>,
}

impl From<CardSummary> for CardSummaryDto {
    fn from(card: CardSummary) -> Self {
        Self {
            id: card.id,
            list_id: card.list_id,
            title: card.title,
            has_description: card.has_description,
            label_ids: card.label_ids,
            assignee_ids: card.assignee_ids,
            due_date: card.due_date,
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
    pub assignee_ids: Vec<Uuid>,
    /// Calendar day, `YYYY-MM-DD`.
    pub due_date: Option<String>,
}

impl From<Card> for CardResponseDto {
    fn from(card: Card) -> Self {
        Self {
            id: card.id,
            list_id: card.list_id,
            title: card.title,
            description: card.description,
            label_ids: card.label_ids,
            assignee_ids: card.assignee_ids,
            due_date: card.due_date,
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
    /// Leave out to keep the date, send `null` to clear it, or a `YYYY-MM-DD` day to set it.
    #[serde(default, deserialize_with = "present_or_null")]
    #[schema(value_type = Option<String>)]
    pub due_date: Option<Option<String>>,
}

/// Tells a missing field (keep) from an explicit `null` (clear).
fn present_or_null<'de, D>(deserializer: D) -> Result<Option<Option<String>>, D::Error>
where
    D: Deserializer<'de>,
{
    Option::<String>::deserialize(deserializer).map(Some)
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

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SetCardAssigneesRequestDto {
    pub user_ids: Vec<Uuid>,
}

#[derive(Serialize, ToSchema)]
pub struct CardAssigneesResponseDto {
    pub assignee_ids: Vec<Uuid>,
}
