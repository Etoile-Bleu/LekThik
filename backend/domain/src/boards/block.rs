use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::due_date::DueDate;
use super::error::BoardsError;

pub const NOTE_MAX_CHARS: usize = 5_000;
pub const COUNTER_LABEL_MAX_CHARS: usize = 60;

/// What a panel of a board is. Only a list holds cards, the others show something.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ListKind {
    List,
    Calendar,
    Agenda,
    Note,
    Counter,
}

impl ListKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::List => "list",
            Self::Calendar => "calendar",
            Self::Agenda => "agenda",
            Self::Note => "note",
            Self::Counter => "counter",
        }
    }

    pub fn parse(value: &str) -> Result<Self, BoardsError> {
        match value {
            "list" => Ok(Self::List),
            "calendar" => Ok(Self::Calendar),
            "agenda" => Ok(Self::Agenda),
            "note" => Ok(Self::Note),
            "counter" => Ok(Self::Counter),
            _ => Err(BoardsError::Invalid(format!("unknown block kind {value}"))),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BlockSize {
    #[default]
    Normal,
    Wide,
}

/// How far ahead the agenda looks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgendaRange {
    Today,
    #[default]
    Week,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CounterMetric {
    #[default]
    Overdue,
    /// Share of the cards that sit in the chosen "done" list.
    DonePercent,
    /// Days left until a chosen date.
    DaysLeft,
    TotalCards,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct CalendarConfig {
    pub size: BlockSize,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct AgendaConfig {
    pub size: BlockSize,
    pub range: AgendaRange,
    /// Only the cards assigned to whoever is looking.
    pub mine_only: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct NoteConfig {
    pub size: BlockSize,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct CounterConfig {
    pub size: BlockSize,
    pub metric: CounterMetric,
    /// Names the number, for instance "Days to launch".
    pub label: String,
    pub done_list_id: Option<Uuid>,
    /// `YYYY-MM-DD`, for the days left.
    pub date: Option<String>,
}

/// The settings of a panel, checked for its kind.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BlockConfig {
    List,
    Calendar(CalendarConfig),
    Agenda(AgendaConfig),
    Note(NoteConfig),
    Counter(CounterConfig),
}

fn invalid(message: impl Into<String>) -> BoardsError {
    BoardsError::Invalid(message.into())
}

fn clean_text(value: &str, max: usize, allow_newlines: bool) -> Result<(), BoardsError> {
    if value.chars().count() > max {
        return Err(invalid(format!("at most {max} characters")));
    }
    let bad = value.chars().any(|character| {
        character.is_control() && !(allow_newlines && matches!(character, '\n' | '\t'))
    });
    if bad {
        return Err(invalid("control characters are not allowed"));
    }
    Ok(())
}

impl BlockConfig {
    pub fn kind(&self) -> ListKind {
        match self {
            Self::List => ListKind::List,
            Self::Calendar(_) => ListKind::Calendar,
            Self::Agenda(_) => ListKind::Agenda,
            Self::Note(_) => ListKind::Note,
            Self::Counter(_) => ListKind::Counter,
        }
    }

    /// Reads and checks the settings sent for a kind. Unknown fields and values are refused.
    pub fn parse(kind: ListKind, value: Value) -> Result<Self, BoardsError> {
        let value = if value.is_null() {
            Value::Object(serde_json::Map::new())
        } else {
            value
        };
        // serde would read an empty array as a struct with all its defaults, so insist on an object.
        if !value.is_object() {
            return Err(invalid("block settings must be an object"));
        }
        let from = |error: serde_json::Error| invalid(format!("invalid block settings: {error}"));

        match kind {
            ListKind::List => match value {
                Value::Object(map) if map.is_empty() => Ok(Self::List),
                _ => Err(invalid("a list has no settings")),
            },
            ListKind::Calendar => Ok(Self::Calendar(serde_json::from_value(value).map_err(from)?)),
            ListKind::Agenda => Ok(Self::Agenda(serde_json::from_value(value).map_err(from)?)),
            ListKind::Note => {
                let note: NoteConfig = serde_json::from_value(value).map_err(from)?;
                clean_text(&note.text, NOTE_MAX_CHARS, true)?;
                Ok(Self::Note(note))
            }
            ListKind::Counter => {
                let mut counter: CounterConfig = serde_json::from_value(value).map_err(from)?;
                clean_text(&counter.label, COUNTER_LABEL_MAX_CHARS, false)?;
                counter.label = counter.label.trim().to_string();

                // Keep only what the chosen number uses, so settings never carry stale leftovers.
                match counter.metric {
                    CounterMetric::DonePercent => {
                        if counter.done_list_id.is_none() {
                            return Err(invalid("choose the list that means done"));
                        }
                        counter.date = None;
                    }
                    CounterMetric::DaysLeft => {
                        let date = counter
                            .date
                            .as_deref()
                            .ok_or_else(|| invalid("choose the date to count down to"))?;
                        DueDate::parse(date)?;
                        counter.done_list_id = None;
                    }
                    CounterMetric::Overdue | CounterMetric::TotalCards => {
                        counter.done_list_id = None;
                        counter.date = None;
                    }
                }
                Ok(Self::Counter(counter))
            }
        }
    }

    pub fn to_value(&self) -> Value {
        let value = match self {
            Self::List => return Value::Object(serde_json::Map::new()),
            Self::Calendar(config) => serde_json::to_value(config),
            Self::Agenda(config) => serde_json::to_value(config),
            Self::Note(config) => serde_json::to_value(config),
            Self::Counter(config) => serde_json::to_value(config),
        };
        value.unwrap_or(Value::Null)
    }

    /// The list a counter measures progress against, which must belong to the same board.
    pub fn done_list(&self) -> Option<Uuid> {
        match self {
            Self::Counter(counter) => counter.done_list_id,
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn counter_of(config: BlockConfig) -> Option<CounterConfig> {
        match config {
            BlockConfig::Counter(counter) => Some(counter),
            _ => None,
        }
    }

    #[test]
    fn kinds_round_trip_through_their_names() {
        for kind in [
            ListKind::List,
            ListKind::Calendar,
            ListKind::Agenda,
            ListKind::Note,
            ListKind::Counter,
        ] {
            assert_eq!(ListKind::parse(kind.as_str()), Ok(kind));
        }
        assert!(ListKind::parse("gantt").is_err());
        assert!(ListKind::parse("").is_err());
    }

    #[test]
    fn a_calendar_starts_normal_sized() {
        let config = BlockConfig::parse(ListKind::Calendar, json!({})).expect("parse");

        assert_eq!(config, BlockConfig::Calendar(CalendarConfig::default()));
        assert_eq!(config.kind(), ListKind::Calendar);
    }

    #[test]
    fn missing_settings_mean_the_defaults() {
        let from_null = BlockConfig::parse(ListKind::Agenda, Value::Null).expect("parse");

        assert_eq!(from_null, BlockConfig::Agenda(AgendaConfig::default()));
    }

    #[test]
    fn unknown_fields_and_values_are_refused() {
        assert!(BlockConfig::parse(ListKind::Calendar, json!({ "colour": "red" })).is_err());
        assert!(BlockConfig::parse(ListKind::Calendar, json!({ "size": "huge" })).is_err());
        assert!(BlockConfig::parse(ListKind::Agenda, json!({ "range": "year" })).is_err());
        assert!(BlockConfig::parse(ListKind::Counter, json!({ "metric": "mood" })).is_err());
        assert!(BlockConfig::parse(ListKind::Note, json!({ "text": 5 })).is_err());
        assert!(BlockConfig::parse(ListKind::Calendar, json!([])).is_err());
    }

    #[test]
    fn a_list_takes_no_settings() {
        assert_eq!(
            BlockConfig::parse(ListKind::List, json!({})),
            Ok(BlockConfig::List)
        );
        assert!(BlockConfig::parse(ListKind::List, json!({ "size": "wide" })).is_err());
    }

    #[test]
    fn a_note_keeps_its_text_and_refuses_too_much_or_hidden_characters() {
        let note = BlockConfig::parse(
            ListKind::Note,
            json!({ "text": "Rules:\n\t- be kind", "size": "wide" }),
        )
        .expect("parse");
        assert_eq!(
            note,
            BlockConfig::Note(NoteConfig {
                size: BlockSize::Wide,
                text: "Rules:\n\t- be kind".to_string()
            })
        );

        let too_long = "a".repeat(NOTE_MAX_CHARS + 1);
        assert!(BlockConfig::parse(ListKind::Note, json!({ "text": too_long })).is_err());
        let at_the_limit = "é".repeat(NOTE_MAX_CHARS);
        assert!(BlockConfig::parse(ListKind::Note, json!({ "text": at_the_limit })).is_ok());
        assert!(BlockConfig::parse(ListKind::Note, json!({ "text": "bad\u{0}text" })).is_err());
        assert!(BlockConfig::parse(ListKind::Note, json!({ "text": "bell\u{7}" })).is_err());
    }

    #[test]
    fn a_done_percentage_needs_the_list_that_means_done() {
        let list = Uuid::new_v4();

        assert!(
            BlockConfig::parse(ListKind::Counter, json!({ "metric": "done_percent" })).is_err()
        );
        let config = BlockConfig::parse(
            ListKind::Counter,
            json!({ "metric": "done_percent", "done_list_id": list, "date": "2026-11-02" }),
        )
        .expect("parse");

        assert_eq!(config.done_list(), Some(list));
        let counter = counter_of(config).expect("a counter");
        assert_eq!(counter.date, None, "settings of other numbers are dropped");
    }

    #[test]
    fn days_left_needs_a_real_date() {
        assert!(BlockConfig::parse(ListKind::Counter, json!({ "metric": "days_left" })).is_err());
        assert!(
            BlockConfig::parse(
                ListKind::Counter,
                json!({ "metric": "days_left", "date": "2026-02-30" })
            )
            .is_err()
        );
        assert!(
            BlockConfig::parse(
                ListKind::Counter,
                json!({ "metric": "days_left", "date": "2026-11-02", "label": " Launch " })
            )
            .is_ok()
        );
    }

    #[test]
    fn a_counter_label_is_trimmed_and_capped() {
        let config = BlockConfig::parse(
            ListKind::Counter,
            json!({ "metric": "total_cards", "label": "  Open work  " }),
        )
        .expect("parse");
        let counter = counter_of(config).expect("a counter");
        assert_eq!(counter.label, "Open work");

        let long = "x".repeat(COUNTER_LABEL_MAX_CHARS + 1);
        assert!(BlockConfig::parse(ListKind::Counter, json!({ "label": long })).is_err());
        assert!(BlockConfig::parse(ListKind::Counter, json!({ "label": "two\nlines" })).is_err());
    }

    #[test]
    fn settings_survive_a_round_trip_through_json() {
        let original = BlockConfig::parse(
            ListKind::Agenda,
            json!({ "range": "today", "mine_only": true, "size": "wide" }),
        )
        .expect("parse");

        let again = BlockConfig::parse(ListKind::Agenda, original.to_value()).expect("parse");

        assert_eq!(original, again);
        assert_eq!(BlockConfig::List.to_value(), json!({}));
    }
}
