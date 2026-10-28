use async_trait::async_trait;
use serde_json::Value;
use uuid::Uuid;

use super::due_date::DueDate;
use super::error::BoardsError;
use super::label_style::LabelColor;
use super::web_url::parse_link;

pub const MAX_FIELDS_PER_BOARD: i64 = 30;
pub const MAX_OPTIONS_PER_FIELD: i64 = 50;
pub const FIELD_NAME_MAX_CHARS: usize = 60;
pub const OPTION_NAME_MAX_CHARS: usize = 40;
pub const FIELD_TEXT_MAX_CHARS: usize = 1_000;
const NUMBER_INTEGER_DIGITS: usize = 12;
const NUMBER_FRACTION_DIGITS: usize = 6;

fn short_name(raw: &str, max: usize) -> Result<String, BoardsError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(BoardsError::Invalid(
            "the name must not be empty".to_string(),
        ));
    }
    if trimmed.chars().count() > max {
        return Err(BoardsError::Invalid(format!(
            "the name must be at most {max} characters"
        )));
    }
    if trimmed.chars().any(char::is_control) {
        return Err(BoardsError::Invalid(
            "the name must not contain control characters".to_string(),
        ));
    }
    Ok(trimmed.to_string())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FieldName(String);

impl FieldName {
    pub fn parse(raw: &str) -> Result<Self, BoardsError> {
        short_name(raw, FIELD_NAME_MAX_CHARS).map(Self)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OptionName(String);

impl OptionName {
    pub fn parse(raw: &str) -> Result<Self, BoardsError> {
        short_name(raw, OPTION_NAME_MAX_CHARS).map(Self)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FieldKind {
    Text,
    Number,
    Date,
    Select,
    Checkbox,
    Url,
}

impl FieldKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Text => "text",
            Self::Number => "number",
            Self::Date => "date",
            Self::Select => "select",
            Self::Checkbox => "checkbox",
            Self::Url => "url",
        }
    }

    pub fn parse(raw: &str) -> Result<Self, BoardsError> {
        match raw {
            "text" => Ok(Self::Text),
            "number" => Ok(Self::Number),
            "date" => Ok(Self::Date),
            "select" => Ok(Self::Select),
            "checkbox" => Ok(Self::Checkbox),
            "url" => Ok(Self::Url),
            _ => Err(BoardsError::Invalid("unknown field type".to_string())),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FieldOption {
    pub id: Uuid,
    pub name: String,
    pub color: LabelColor,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Field {
    pub id: Uuid,
    pub board_id: Uuid,
    pub name: String,
    pub kind: FieldKind,
    pub position: i32,
    pub show_on_card: bool,
    pub options: Vec<FieldOption>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FieldValue {
    Text(String),
    Number(String),
    Date(String),
    Checkbox(bool),
    Option(Uuid),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CardFieldValue {
    pub card_id: Uuid,
    pub field_id: Uuid,
    pub value: FieldValue,
}

#[derive(Debug, Clone)]
pub struct NewField {
    pub name: FieldName,
    pub kind: FieldKind,
    pub options: Vec<(OptionName, LabelColor)>,
    pub show_on_card: bool,
}

#[derive(Debug, Clone, Default)]
pub struct FieldPatch {
    pub name: Option<FieldName>,
    pub show_on_card: Option<bool>,
    pub position: Option<usize>,
}

fn invalid(message: &str) -> BoardsError {
    BoardsError::Invalid(message.to_string())
}

pub fn normalise_number(raw: &str) -> Result<String, BoardsError> {
    let text = raw.trim();
    let (negative, digits) = match text.strip_prefix('-') {
        Some(rest) => (true, rest),
        None => (false, text),
    };
    let (whole, fraction) = digits.split_once('.').unwrap_or((digits, ""));
    let all_digits = |part: &str| part.chars().all(|c| c.is_ascii_digit());
    let shaped = !whole.is_empty()
        && all_digits(whole)
        && all_digits(fraction)
        && (digits.contains('.') != fraction.is_empty());
    if !shaped {
        return Err(invalid("a number looks like 12 or -3.5"));
    }
    if whole.len() > NUMBER_INTEGER_DIGITS || fraction.len() > NUMBER_FRACTION_DIGITS {
        return Err(invalid(
            "a number has at most 12 digits before the point and 6 after",
        ));
    }
    let whole = whole.trim_start_matches('0');
    let whole = if whole.is_empty() { "0" } else { whole };
    let fraction = fraction.trim_end_matches('0');
    let magnitude = if fraction.is_empty() {
        whole.to_string()
    } else {
        format!("{whole}.{fraction}")
    };
    if negative && magnitude != "0" {
        Ok(format!("-{magnitude}"))
    } else {
        Ok(magnitude)
    }
}

impl FieldValue {
    pub fn parse(kind: FieldKind, raw: &Value) -> Result<Option<Self>, BoardsError> {
        if raw.is_null() {
            return Ok(None);
        }
        match (kind, raw) {
            (FieldKind::Text, Value::String(text)) => {
                let text = text.trim();
                if text.is_empty() {
                    return Ok(None);
                }
                if text.chars().count() > FIELD_TEXT_MAX_CHARS {
                    return Err(BoardsError::Invalid(format!(
                        "at most {FIELD_TEXT_MAX_CHARS} characters"
                    )));
                }
                if text.chars().any(char::is_control) {
                    return Err(invalid("control characters are not allowed"));
                }
                Ok(Some(Self::Text(text.to_string())))
            }
            (FieldKind::Url, Value::String(text)) => {
                if text.trim().is_empty() {
                    return Ok(None);
                }
                if text.trim().chars().count() > FIELD_TEXT_MAX_CHARS {
                    return Err(invalid("that address is too long"));
                }
                Ok(Some(Self::Text(parse_link(text)?)))
            }
            (FieldKind::Number, Value::String(text)) => {
                if text.trim().is_empty() {
                    return Ok(None);
                }
                Ok(Some(Self::Number(normalise_number(text)?)))
            }
            (FieldKind::Date, Value::String(text)) => {
                if text.trim().is_empty() {
                    return Ok(None);
                }
                Ok(Some(Self::Date(
                    DueDate::parse(text.trim())?.as_str().to_string(),
                )))
            }
            (FieldKind::Checkbox, Value::Bool(checked)) => Ok(Some(Self::Checkbox(*checked))),
            (FieldKind::Select, Value::String(id)) => Uuid::parse_str(id)
                .map(|id| Some(Self::Option(id)))
                .map_err(|_| invalid("that is not a choice")),
            _ => Err(invalid("that value does not fit this field")),
        }
    }
}

#[cfg_attr(feature = "test-utils", mockall::automock)]
#[async_trait]
pub trait FieldRepo: Send + Sync {
    async fn create(
        &self,
        user_id: Uuid,
        board_id: Uuid,
        field: NewField,
    ) -> Result<Field, BoardsError>;
    async fn update(
        &self,
        user_id: Uuid,
        board_id: Uuid,
        field_id: Uuid,
        patch: FieldPatch,
    ) -> Result<Field, BoardsError>;
    async fn delete(
        &self,
        user_id: Uuid,
        board_id: Uuid,
        field_id: Uuid,
    ) -> Result<(), BoardsError>;
    async fn add_option(
        &self,
        user_id: Uuid,
        board_id: Uuid,
        field_id: Uuid,
        name: OptionName,
        color: LabelColor,
    ) -> Result<Field, BoardsError>;
    async fn update_option(
        &self,
        user_id: Uuid,
        board_id: Uuid,
        field_id: Uuid,
        option_id: Uuid,
        name: Option<OptionName>,
        color: Option<LabelColor>,
    ) -> Result<Field, BoardsError>;
    async fn delete_option(
        &self,
        user_id: Uuid,
        board_id: Uuid,
        field_id: Uuid,
        option_id: Uuid,
    ) -> Result<Field, BoardsError>;
    async fn kind_of(
        &self,
        user_id: Uuid,
        card_id: Uuid,
        field_id: Uuid,
    ) -> Result<FieldKind, BoardsError>;
    async fn set_value(
        &self,
        user_id: Uuid,
        card_id: Uuid,
        field_id: Uuid,
        value: Option<FieldValue>,
    ) -> Result<Option<FieldValue>, BoardsError>;
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn names_are_trimmed_and_checked() {
        assert_eq!(
            FieldName::parse("  Story size ").expect("name").as_str(),
            "Story size"
        );
        assert!(FieldName::parse("   ").is_err());
        assert!(FieldName::parse(&"x".repeat(FIELD_NAME_MAX_CHARS + 1)).is_err());
        assert!(FieldName::parse(&"é".repeat(FIELD_NAME_MAX_CHARS)).is_ok());
        assert!(FieldName::parse("two\nlines").is_err());
        assert!(OptionName::parse(&"x".repeat(OPTION_NAME_MAX_CHARS + 1)).is_err());
        assert_eq!(
            OptionName::parse(" Done ").expect("option").as_str(),
            "Done"
        );
    }

    #[test]
    fn kinds_round_trip_through_their_names() {
        for kind in [
            FieldKind::Text,
            FieldKind::Number,
            FieldKind::Date,
            FieldKind::Select,
            FieldKind::Checkbox,
            FieldKind::Url,
        ] {
            assert_eq!(FieldKind::parse(kind.as_str()), Ok(kind));
        }
        assert!(FieldKind::parse("formula").is_err());
    }

    #[test]
    fn numbers_are_kept_exactly_and_written_one_way() {
        for (raw, want) in [
            ("12", "12"),
            ("  -3.50 ", "-3.5"),
            ("007", "7"),
            ("0.000001", "0.000001"),
            ("-0", "0"),
            ("-0.0", "0"),
            ("999999999999.999999", "999999999999.999999"),
            ("10.0", "10"),
        ] {
            assert_eq!(normalise_number(raw).as_deref(), Ok(want), "{raw}");
        }
    }

    #[test]
    fn numbers_that_are_not_plain_decimals_are_refused() {
        for bad in [
            "",
            " ",
            "abc",
            "1e3",
            "1,5",
            "1.",
            ".5",
            "--1",
            "+1",
            "1.2.3",
            "0x10",
            "NaN",
            "Infinity",
            "1 000",
            "1000000000000",
            "0.0000001",
            "12px",
        ] {
            assert!(normalise_number(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn a_value_must_fit_the_kind_of_its_field() {
        let choice = Uuid::new_v4();
        assert_eq!(
            FieldValue::parse(FieldKind::Text, &json!("  hello ")),
            Ok(Some(FieldValue::Text("hello".to_string())))
        );
        assert_eq!(
            FieldValue::parse(FieldKind::Number, &json!("2.50")),
            Ok(Some(FieldValue::Number("2.5".to_string())))
        );
        assert_eq!(
            FieldValue::parse(FieldKind::Date, &json!("2026-11-02")),
            Ok(Some(FieldValue::Date("2026-11-02".to_string())))
        );
        assert_eq!(
            FieldValue::parse(FieldKind::Checkbox, &json!(true)),
            Ok(Some(FieldValue::Checkbox(true)))
        );
        assert_eq!(
            FieldValue::parse(FieldKind::Select, &json!(choice.to_string())),
            Ok(Some(FieldValue::Option(choice)))
        );
        assert_eq!(
            FieldValue::parse(FieldKind::Url, &json!("HTTPS://Example.com/a")),
            Ok(Some(FieldValue::Text("https://example.com/a".to_string())))
        );
    }

    #[test]
    fn null_and_blank_clear_a_value() {
        for kind in [
            FieldKind::Text,
            FieldKind::Number,
            FieldKind::Date,
            FieldKind::Select,
            FieldKind::Checkbox,
            FieldKind::Url,
        ] {
            assert_eq!(FieldValue::parse(kind, &Value::Null), Ok(None), "{kind:?}");
        }
        assert_eq!(FieldValue::parse(FieldKind::Text, &json!("   ")), Ok(None));
        assert_eq!(FieldValue::parse(FieldKind::Number, &json!("")), Ok(None));
        assert_eq!(FieldValue::parse(FieldKind::Date, &json!(" ")), Ok(None));
    }

    #[test]
    fn a_value_of_the_wrong_shape_is_refused() {
        let too_long = json!("x".repeat(FIELD_TEXT_MAX_CHARS + 1));
        for (kind, bad) in [
            (FieldKind::Text, json!(5)),
            (FieldKind::Text, too_long),
            (FieldKind::Text, json!("bell\u{7}")),
            (FieldKind::Text, json!("two\nlines")),
            (FieldKind::Number, json!(5)),
            (FieldKind::Number, json!("5,5")),
            (FieldKind::Date, json!("2026-02-30")),
            (FieldKind::Date, json!(20261102)),
            (FieldKind::Checkbox, json!("true")),
            (FieldKind::Checkbox, json!(1)),
            (FieldKind::Select, json!("not-an-id")),
            (FieldKind::Select, json!(7)),
            (FieldKind::Url, json!("javascript:alert(1)")),
            (FieldKind::Url, json!("https://user:pw@example.com")),
            (FieldKind::Url, json!({ "href": "https://example.com" })),
        ] {
            assert!(FieldValue::parse(kind, &bad).is_err(), "{kind:?} {bad}");
        }
    }
}
