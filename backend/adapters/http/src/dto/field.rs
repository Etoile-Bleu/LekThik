use domain::boards::{CardFieldValue, Field, FieldOption, FieldValue};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Serialize, ToSchema)]
pub struct FieldOptionDto {
    pub id: Uuid,
    pub name: String,
    #[schema(example = "amber")]
    pub color: String,
}

impl From<FieldOption> for FieldOptionDto {
    fn from(option: FieldOption) -> Self {
        Self {
            id: option.id,
            name: option.name,
            color: option.color.as_str().to_string(),
        }
    }
}

/// A property a board defines, which every card of the board can carry a value for.
#[derive(Serialize, ToSchema)]
pub struct FieldDto {
    pub id: Uuid,
    pub board_id: Uuid,
    pub name: String,
    /// `text`, `number`, `date`, `select`, `checkbox` or `url`. A field never changes kind.
    pub kind: String,
    pub position: i32,
    /// Whether the value shows on the face of the card.
    pub show_on_card: bool,
    /// The choices of a `select` field, empty for every other kind.
    pub options: Vec<FieldOptionDto>,
}

impl From<Field> for FieldDto {
    fn from(field: Field) -> Self {
        Self {
            id: field.id,
            board_id: field.board_id,
            name: field.name,
            kind: field.kind.as_str().to_string(),
            position: field.position,
            show_on_card: field.show_on_card,
            options: field.options.into_iter().map(Into::into).collect(),
        }
    }
}

pub fn value_json(value: &FieldValue) -> Value {
    match value {
        FieldValue::Text(text) | FieldValue::Number(text) | FieldValue::Date(text) => {
            Value::String(text.clone())
        }
        FieldValue::Checkbox(checked) => Value::Bool(*checked),
        FieldValue::Option(id) => Value::String(id.to_string()),
    }
}

/// The value one card holds for one field.
#[derive(Serialize, ToSchema)]
pub struct CardFieldValueDto {
    pub card_id: Uuid,
    pub field_id: Uuid,
    /// A string for text, url, date and choice (the choice id), a decimal string for a number, a
    /// boolean for a checkbox.
    #[schema(value_type = Object)]
    pub value: Value,
}

impl From<CardFieldValue> for CardFieldValueDto {
    fn from(value: CardFieldValue) -> Self {
        Self {
            card_id: value.card_id,
            field_id: value.field_id,
            value: value_json(&value.value),
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct NewOptionDto {
    pub name: String,
    #[schema(example = "amber")]
    pub color: String,
}

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateFieldRequestDto {
    pub name: String,
    pub kind: String,
    /// Only for a `select` field.
    #[serde(default)]
    pub options: Vec<NewOptionDto>,
    #[serde(default)]
    pub show_on_card: bool,
}

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateFieldRequestDto {
    pub name: Option<String>,
    pub show_on_card: Option<bool>,
    /// Where the field goes among the others, counted from 0.
    pub position: Option<usize>,
}

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateOptionRequestDto {
    pub name: Option<String>,
    pub color: Option<String>,
}

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SetFieldValueRequestDto {
    /// The value, or `null` to clear it. Its shape depends on the kind of the field.
    #[schema(value_type = Object)]
    pub value: Value,
}

#[derive(Serialize, ToSchema)]
pub struct FieldValueResponseDto {
    #[schema(value_type = Object)]
    pub value: Value,
}
