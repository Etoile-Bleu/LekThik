use domain::boards::{AssignedCard, Card, CardSummary};
use serde::{Deserialize, Deserializer, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Serialize, ToSchema)]
pub struct CardSummaryDto {
    pub id: Uuid,
    pub list_id: Uuid,
    pub title: String,
    pub has_description: bool,
    /// The first characters of the description, empty when there is none.
    pub description_preview: String,
    pub label_ids: Vec<Uuid>,
    pub assignee_ids: Vec<Uuid>,
    /// Calendar day, `YYYY-MM-DD`.
    pub due_date: Option<String>,
    /// How many comments the card has.
    pub comment_count: i64,
}

impl From<CardSummary> for CardSummaryDto {
    fn from(card: CardSummary) -> Self {
        Self {
            id: card.id,
            list_id: card.list_id,
            title: card.title,
            has_description: card.has_description,
            description_preview: card.description_preview,
            label_ids: card.label_ids,
            assignee_ids: card.assignee_ids,
            due_date: card.due_date,
            comment_count: card.comment_count,
        }
    }
}

/// A card assigned to the signed in user, with the board it lives on.
#[derive(Serialize, ToSchema)]
pub struct AssignedCardDto {
    pub id: Uuid,
    pub title: String,
    /// Calendar day, `YYYY-MM-DD`.
    pub due_date: Option<String>,
    pub list_id: Uuid,
    pub list_name: String,
    pub board_id: Uuid,
    pub board_name: String,
    pub workspace_id: Uuid,
    pub workspace_name: String,
}

impl From<AssignedCard> for AssignedCardDto {
    fn from(card: AssignedCard) -> Self {
        Self {
            id: card.id,
            title: card.title,
            due_date: card.due_date,
            list_id: card.list_id,
            list_name: card.list_name,
            board_id: card.board_id,
            board_name: card.board_name,
            workspace_id: card.workspace_id,
            workspace_name: card.workspace_name,
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
