use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::due_date::DueDate;
use super::embed::{EmbedProvider, parse_embed_url};
use super::error::BoardsError;
use super::web_url::parse_link;

pub const NOTE_MAX_CHARS: usize = 10_000;
pub const COUNTER_LABEL_MAX_CHARS: usize = 60;
pub const ALT_MAX_CHARS: usize = 300;
pub const CAPTION_MAX_CHARS: usize = 300;
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProgressStyle {
    #[default]
    Ring,
    Bar,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct ProgressConfig {
    pub size: BlockSize,
    pub style: ProgressStyle,
    pub label: String,
    pub done_list_id: Option<Uuid>,
}

/// A picture kept by LekThik itself. Alternative text is required, not optional.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct ImageConfig {
    pub size: BlockSize,
    pub alt: String,
    pub caption: String,
}

/// A video or calendar from one of the known providers, stored as an identifier only.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EmbedConfig {
    pub size: BlockSize,
    pub provider: EmbedProvider,
    pub id: String,
    /// Names the frame for screen readers.
    pub title: String,
}

/// What an embed is created or changed with: an address to recognise, or what was stored.
#[derive(Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct EmbedInput {
    size: BlockSize,
    url: Option<String>,
    provider: Option<EmbedProvider>,
    id: Option<String>,
    title: String,
}

/// A plain link card. Nothing is fetched from the address.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct LinkConfig {
    pub size: BlockSize,
    pub url: String,
    pub title: String,
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
            Self::Image(_) => ListKind::Image,
            Self::Embed(_) => ListKind::Embed,
            Self::Link(_) => ListKind::Link,
            Self::Progress(_) => ListKind::Progress,
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
            ListKind::Image => {
                let mut image: ImageConfig = serde_json::from_value(value).map_err(from)?;
                image.alt = image.alt.trim().to_string();
                image.caption = image.caption.trim().to_string();
                if image.alt.is_empty() {
                    return Err(invalid("describe the image, for people who cannot see it"));
                }
                clean_text(&image.alt, ALT_MAX_CHARS, false)?;
                clean_text(&image.caption, CAPTION_MAX_CHARS, false)?;
                Ok(Self::Image(image))
            }
            ListKind::Embed => {
                let input: EmbedInput = serde_json::from_value(value).map_err(from)?;
                let (provider, id) = match (input.url.as_deref(), input.provider, input.id) {
                    (Some(url), None, None) => parse_embed_url(url)?,
                    (None, Some(provider), Some(id)) if provider.accepts(&id) => (provider, id),
                    (None, Some(_), Some(_)) => {
                        return Err(invalid("that identifier is not valid"));
                    }
                    _ => {
                        return Err(invalid(
                            "give either an address, or a provider with its identifier",
                        ));
                    }
                };
                let title = input.title.trim().to_string();
                if title.is_empty() {
                    return Err(invalid("name the embed, for people who cannot see it"));
                }
                clean_text(&title, BLOCK_TITLE_MAX_CHARS, false)?;
                Ok(Self::Embed(EmbedConfig {
                    size: input.size,
                    provider,
                    id,
                    title,
                }))
            }
            ListKind::Link => {
                let mut link: LinkConfig = serde_json::from_value(value).map_err(from)?;
                link.url = parse_link(&link.url)?;
                link.title = link.title.trim().to_string();
                clean_text(&link.title, BLOCK_TITLE_MAX_CHARS, false)?;
                Ok(Self::Link(link))
            }
            ListKind::Progress => {
                let mut progress: ProgressConfig = serde_json::from_value(value).map_err(from)?;
                progress.label = progress.label.trim().to_string();
                clean_text(&progress.label, COUNTER_LABEL_MAX_CHARS, false)?;
                Ok(Self::Progress(progress))
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
            Self::Image(config) => serde_json::to_value(config),
            Self::Embed(config) => serde_json::to_value(config),
            Self::Link(config) => serde_json::to_value(config),
            Self::Progress(config) => serde_json::to_value(config),
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
            ListKind::Image,
            ListKind::Embed,
            ListKind::Link,
            ListKind::Progress,
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

    #[test]
    fn an_image_needs_a_description() {
        assert!(BlockConfig::parse(ListKind::Image, json!({})).is_err());
        assert!(BlockConfig::parse(ListKind::Image, json!({ "alt": "   " })).is_err());
        let config = BlockConfig::parse(
            ListKind::Image,
            json!({ "alt": " Floor plan of the hall ", "caption": "Level 1" }),
        )
        .expect("parse");

        assert_eq!(
            config,
            BlockConfig::Image(ImageConfig {
                size: BlockSize::Normal,
                alt: "Floor plan of the hall".to_string(),
                caption: "Level 1".to_string()
            })
        );
    }

    #[test]
    fn image_text_is_capped_and_one_line() {
        let long = "x".repeat(ALT_MAX_CHARS + 1);
        assert!(BlockConfig::parse(ListKind::Image, json!({ "alt": long })).is_err());
        assert!(BlockConfig::parse(ListKind::Image, json!({ "alt": "a\nb" })).is_err());
        let caption = "y".repeat(CAPTION_MAX_CHARS + 1);
        assert!(
            BlockConfig::parse(ListKind::Image, json!({ "alt": "ok", "caption": caption }))
                .is_err()
        );
        assert!(BlockConfig::parse(ListKind::Image, json!({ "alt": "ok", "src": "x" })).is_err());
    }

    #[test]
    fn an_embed_is_made_from_an_address_and_stores_only_the_identifier() {
        let config = BlockConfig::parse(
            ListKind::Embed,
            json!({ "url": "https://youtu.be/dQw4w9WgXcQ", "title": " Launch teaser " }),
        )
        .expect("parse");

        assert_eq!(
            config.to_value(),
            json!({ "size": "normal", "provider": "youtube", "id": "dQw4w9WgXcQ", "title": "Launch teaser" })
        );
    }

    #[test]
    fn an_embed_can_be_saved_again_from_what_was_stored() {
        let stored =
            json!({ "size": "wide", "provider": "vimeo", "id": "76979871", "title": "Demo" });

        let config = BlockConfig::parse(ListKind::Embed, stored.clone()).expect("parse");

        assert_eq!(config.to_value(), stored);
    }

    #[test]
    fn an_embed_refuses_unknown_providers_bad_identifiers_and_missing_titles() {
        for bad in [
            json!({ "url": "https://evil.example/x", "title": "T" }),
            json!({ "url": "https://youtu.be/dQw4w9WgXcQ" }),
            json!({ "url": "https://youtu.be/dQw4w9WgXcQ", "title": "  " }),
            json!({ "provider": "youtube", "id": "bad", "title": "T" }),
            json!({ "provider": "youtube", "title": "T" }),
            json!({ "url": "https://youtu.be/dQw4w9WgXcQ", "provider": "vimeo", "id": "76979871", "title": "T" }),
            json!({ "url": "https://youtu.be/dQw4w9WgXcQ", "title": "T", "autoplay": true }),
            json!({ "title": "T" }),
        ] {
            assert!(
                BlockConfig::parse(ListKind::Embed, bad.clone()).is_err(),
                "{bad}"
            );
        }
    }

    #[test]
    fn a_link_keeps_a_plain_address_and_refuses_the_rest() {
        let config = BlockConfig::parse(
            ListKind::Link,
            json!({ "url": "HTTPS://Example.com/docs", "title": " Docs " }),
        )
        .expect("parse");
        assert_eq!(
            config.to_value(),
            json!({ "size": "normal", "url": "https://example.com/docs", "title": "Docs" })
        );

        for bad in [
            json!({}),
            json!({ "url": "javascript:alert(1)" }),
            json!({ "url": "https://user:pw@example.com" }),
            json!({ "url": "https://example.com", "title": "a\nb" }),
            json!({ "url": "https://example.com", "preview": true }),
        ] {
            assert!(
                BlockConfig::parse(ListKind::Link, bad.clone()).is_err(),
                "{bad}"
            );
        }
    }

    #[test]
    fn a_progress_block_starts_as_a_ring_with_no_list_chosen() {
        let config = BlockConfig::parse(ListKind::Progress, json!({})).expect("parse");

        assert_eq!(config, BlockConfig::Progress(ProgressConfig::default()));
        assert_eq!(config.done_list(), None);
        assert_eq!(
            config.to_value(),
            json!({ "size": "normal", "style": "ring", "label": "", "done_list_id": null })
        );
    }

    #[test]
    fn a_progress_block_keeps_its_style_label_and_done_list() {
        let list = Uuid::new_v4();
        let config = BlockConfig::parse(
            ListKind::Progress,
            json!({ "style": "bar", "label": "  Sprint 12  ", "done_list_id": list, "size": "wide" }),
        )
        .expect("parse");

        assert_eq!(config.done_list(), Some(list));
        assert_eq!(
            config,
            BlockConfig::Progress(ProgressConfig {
                size: BlockSize::Wide,
                style: ProgressStyle::Bar,
                label: "Sprint 12".to_string(),
                done_list_id: Some(list),
            })
        );
        let again = BlockConfig::parse(ListKind::Progress, config.to_value()).expect("parse");
        assert_eq!(config, again);
    }

    #[test]
    fn a_progress_block_refuses_unknown_settings_and_odd_labels() {
        let long = "x".repeat(COUNTER_LABEL_MAX_CHARS + 1);
        for bad in [
            json!({ "style": "pie" }),
            json!({ "colour": "red" }),
            json!({ "done_list_id": "not-an-id" }),
            json!({ "label": long }),
            json!({ "label": "two\nlines" }),
            json!([]),
        ] {
            assert!(
                BlockConfig::parse(ListKind::Progress, bad.clone()).is_err(),
                "{bad}"
            );
        }
    }
}
