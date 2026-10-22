use domain::boards::Label;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Serialize, ToSchema)]
pub struct LabelDto {
    pub id: Uuid,
    pub board_id: Uuid,
    pub name: String,
    #[schema(example = "red")]
    pub color: String,
    #[schema(example = "urgent")]
    pub priority: String,
}

impl From<Label> for LabelDto {
    fn from(label: Label) -> Self {
        Self {
            id: label.id,
            board_id: label.board_id,
            name: label.name,
            color: label.color.as_str().to_string(),
            priority: label.priority.as_str().to_string(),
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateLabelRequestDto {
    pub name: String,
    #[schema(example = "red")]
    pub color: String,
    #[schema(example = "urgent")]
    pub priority: String,
}

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateLabelRequestDto {
    pub name: Option<String>,
    pub color: Option<String>,
    pub priority: Option<String>,
}
