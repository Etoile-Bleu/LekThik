mod calendar;
mod chart;
mod clocks;
mod counter;
mod media;
mod note;
mod poll;
mod progress;
mod snippet;
mod table;
mod timer;

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::error::BoardsError;

pub use calendar::{AgendaConfig, AgendaRange, CalendarConfig, OverdueConfig};
pub use chart::{ChartConfig, ChartSource, ChartStyle};
pub use clocks::{CLOCKS_MAX_ZONES, ClocksConfig, PLACE_NAME_MAX_CHARS, Place, ZONE_MAX_CHARS};
pub use counter::{COUNTER_LABEL_MAX_CHARS, CounterConfig, CounterMetric};
pub use media::{ALT_MAX_CHARS, CAPTION_MAX_CHARS, EmbedConfig, ImageConfig, LinkConfig};
pub use note::{NOTE_MAX_CHARS, NoteConfig};
pub use poll::{
    POLL_MAX_OPTIONS, POLL_MIN_OPTIONS, POLL_OPTION_MAX_CHARS, POLL_QUESTION_MAX_CHARS, PollConfig,
    PollOption,
};
pub use progress::{ProgressConfig, ProgressStyle};
pub use snippet::{SNIPPET_MAX_CHARS, SNIPPET_MAX_LINES, SnippetConfig, SnippetLanguage};
pub use table::{
    TABLE_CELL_MAX_CHARS, TABLE_MAX_BYTES, TABLE_MAX_COLUMNS, TABLE_MAX_ROWS, TableConfig,
};
pub use timer::{TimerConfig, TimerMode, TimerState};

pub const BLOCK_TITLE_MAX_CHARS: usize = 100;

/// What a panel of a board is. Only a list holds cards, the others show something.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ListKind {
    List,
    Calendar,
    Agenda,
    Note,
    Counter,
    Image,
    Embed,
    Link,
    Progress,
    Overdue,
    Chart,
    Snippet,
    Table,
    Clocks,
    Timer,
    Poll,
}

impl ListKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::List => "list",
            Self::Calendar => "calendar",
            Self::Agenda => "agenda",
            Self::Note => "note",
            Self::Counter => "counter",
            Self::Image => "image",
            Self::Embed => "embed",
            Self::Link => "link",
            Self::Progress => "progress",
            Self::Overdue => "overdue",
            Self::Chart => "chart",
            Self::Snippet => "snippet",
            Self::Table => "table",
            Self::Clocks => "clocks",
            Self::Timer => "timer",
            Self::Poll => "poll",
        }
    }

    pub fn parse(value: &str) -> Result<Self, BoardsError> {
        match value {
            "list" => Ok(Self::List),
            "calendar" => Ok(Self::Calendar),
            "agenda" => Ok(Self::Agenda),
            "note" => Ok(Self::Note),
            "counter" => Ok(Self::Counter),
            "image" => Ok(Self::Image),
            "embed" => Ok(Self::Embed),
            "link" => Ok(Self::Link),
            "progress" => Ok(Self::Progress),
            "overdue" => Ok(Self::Overdue),
            "chart" => Ok(Self::Chart),
            "snippet" => Ok(Self::Snippet),
            "table" => Ok(Self::Table),
            "clocks" => Ok(Self::Clocks),
            "timer" => Ok(Self::Timer),
            "poll" => Ok(Self::Poll),
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

/// The settings of a panel, checked for its kind.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BlockConfig {
    List,
    Calendar(CalendarConfig),
    Agenda(AgendaConfig),
    Note(NoteConfig),
    Counter(CounterConfig),
    Image(ImageConfig),
    Embed(EmbedConfig),
    Link(LinkConfig),
    Progress(ProgressConfig),
    Overdue(OverdueConfig),
    Chart(ChartConfig),
    Snippet(SnippetConfig),
    Table(TableConfig),
    Clocks(ClocksConfig),
    Timer(TimerConfig),
    Poll(PollConfig),
}

fn invalid(message: impl Into<String>) -> BoardsError {
    BoardsError::Invalid(message.into())
}

fn read<T: DeserializeOwned>(value: Value) -> Result<T, BoardsError> {
    serde_json::from_value(value)
        .map_err(|error| invalid(format!("invalid block settings: {error}")))
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
            Self::Image(_) => ListKind::Image,
            Self::Embed(_) => ListKind::Embed,
            Self::Link(_) => ListKind::Link,
            Self::Progress(_) => ListKind::Progress,
            Self::Overdue(_) => ListKind::Overdue,
            Self::Chart(_) => ListKind::Chart,
            Self::Snippet(_) => ListKind::Snippet,
            Self::Table(_) => ListKind::Table,
            Self::Clocks(_) => ListKind::Clocks,
            Self::Timer(_) => ListKind::Timer,
            Self::Poll(_) => ListKind::Poll,
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

        match kind {
            ListKind::List => match value {
                Value::Object(map) if map.is_empty() => Ok(Self::List),
                _ => Err(invalid("a list has no settings")),
            },
            ListKind::Calendar => calendar::parse_calendar(value).map(Self::Calendar),
            ListKind::Agenda => calendar::parse_agenda(value).map(Self::Agenda),
            ListKind::Note => note::parse(value).map(Self::Note),
            ListKind::Counter => counter::parse(value).map(Self::Counter),
            ListKind::Image => media::parse_image(value).map(Self::Image),
            ListKind::Embed => media::parse_embed(value).map(Self::Embed),
            ListKind::Link => media::parse_link_card(value).map(Self::Link),
            ListKind::Progress => progress::parse(value).map(Self::Progress),
            ListKind::Overdue => calendar::parse_overdue(value).map(Self::Overdue),
            ListKind::Chart => chart::parse(value).map(Self::Chart),
            ListKind::Snippet => snippet::parse(value).map(Self::Snippet),
            ListKind::Table => table::parse(value).map(Self::Table),
            ListKind::Clocks => clocks::parse(value).map(Self::Clocks),
            ListKind::Timer => timer::parse(value).map(Self::Timer),
            ListKind::Poll => poll::parse(value).map(Self::Poll),
        }
    }

    pub fn to_value(&self) -> Value {
        let value = match self {
            Self::List => return Value::Object(serde_json::Map::new()),
            Self::Calendar(config) => serde_json::to_value(config),
            Self::Agenda(config) => serde_json::to_value(config),
            Self::Note(config) => serde_json::to_value(config),
            Self::Counter(config) => serde_json::to_value(config),
            Self::Image(config) => serde_json::to_value(config),
            Self::Embed(config) => serde_json::to_value(config),
            Self::Link(config) => serde_json::to_value(config),
            Self::Progress(config) => serde_json::to_value(config),
            Self::Overdue(config) => serde_json::to_value(config),
            Self::Chart(config) => serde_json::to_value(config),
            Self::Snippet(config) => serde_json::to_value(config),
            Self::Table(config) => serde_json::to_value(config),
            Self::Clocks(config) => serde_json::to_value(config),
            Self::Timer(config) => serde_json::to_value(config),
            Self::Poll(config) => serde_json::to_value(config),
        };
        value.unwrap_or(Value::Null)
    }

    /// The list a counter measures progress against, which must belong to the same board.
    pub fn done_list(&self) -> Option<Uuid> {
        match self {
            Self::Counter(counter) => counter.done_list_id,
            Self::Progress(progress) => progress.done_list_id,
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn kinds_round_trip_through_their_names() {
        for kind in [
            ListKind::List,
            ListKind::Calendar,
            ListKind::Agenda,
            ListKind::Note,
            ListKind::Counter,
            ListKind::Image,
            ListKind::Embed,
            ListKind::Link,
            ListKind::Progress,
            ListKind::Overdue,
            ListKind::Chart,
            ListKind::Snippet,
            ListKind::Table,
            ListKind::Clocks,
            ListKind::Timer,
            ListKind::Poll,
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

    #[test]
    fn an_overdue_block_only_has_a_size() {
        let config =
            BlockConfig::parse(ListKind::Overdue, json!({ "size": "wide" })).expect("parse");

        assert_eq!(config.to_value(), json!({ "size": "wide" }));
        assert_eq!(config.kind(), ListKind::Overdue);
        assert_eq!(
            BlockConfig::parse(ListKind::Overdue, Value::Null),
            Ok(BlockConfig::Overdue(OverdueConfig::default()))
        );
        for bad in [
            json!({ "user_id": "someone" }),
            json!({ "size": "huge" }),
            json!([]),
        ] {
            assert!(
                BlockConfig::parse(ListKind::Overdue, bad.clone()).is_err(),
                "{bad}"
            );
        }
    }
}
