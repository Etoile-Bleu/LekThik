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
pub const SNIPPET_MAX_CHARS: usize = 12_000;
pub const SNIPPET_MAX_LINES: usize = 500;
pub const TABLE_MAX_ROWS: usize = 100;
pub const TABLE_MAX_COLUMNS: usize = 12;
pub const TABLE_CELL_MAX_CHARS: usize = 200;
pub const TABLE_MAX_BYTES: usize = 40_000;
pub const CLOCKS_MAX_ZONES: usize = 6;
pub const ZONE_MAX_CHARS: usize = 40;
pub const PLACE_NAME_MAX_CHARS: usize = 60;
pub const TIMER_FOCUS_MAX_MINUTES: u16 = 120;
pub const TIMER_SHORT_MAX_MINUTES: u16 = 60;
pub const TIMER_LONG_MAX_MINUTES: u16 = 120;
pub const TIMER_MAX_REMAINING_MS: u32 = 4 * 3_600_000;
pub const TIMER_MIN_END_MS: i64 = 1_000_000_000_000;
pub const TIMER_MAX_END_MS: i64 = 4_102_444_800_000;
pub const TIMER_MAX_CYCLE: u32 = 999;

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

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct OverdueConfig {
    pub size: BlockSize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TimerMode {
    #[default]
    Focus,
    ShortBreak,
    LongBreak,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TimerState {
    #[default]
    Idle,
    Running,
    Paused,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct TimerConfig {
    pub size: BlockSize,
    pub mode: TimerMode,
    pub focus_minutes: u16,
    pub short_minutes: u16,
    pub long_minutes: u16,
    pub state: TimerState,
    pub ends_at_ms: Option<i64>,
    pub remaining_ms: Option<u32>,
    pub cycle: u32,
}

impl Default for TimerConfig {
    fn default() -> Self {
        Self {
            size: BlockSize::Normal,
            mode: TimerMode::Focus,
            focus_minutes: 25,
            short_minutes: 5,
            long_minutes: 15,
            state: TimerState::Idle,
            ends_at_ms: None,
            remaining_ms: None,
            cycle: 0,
        }
    }
}

impl TimerConfig {
    fn check(&self) -> Result<(), BoardsError> {
        let in_range = |minutes: u16, max: u16| (1..=max).contains(&minutes);
        if !in_range(self.focus_minutes, TIMER_FOCUS_MAX_MINUTES)
            || !in_range(self.short_minutes, TIMER_SHORT_MAX_MINUTES)
            || !in_range(self.long_minutes, TIMER_LONG_MAX_MINUTES)
        {
            return Err(invalid("that length of time is not allowed"));
        }
        if self.cycle > TIMER_MAX_CYCLE {
            return Err(invalid("too many sessions"));
        }
        let end_ok = |end: i64| (TIMER_MIN_END_MS..=TIMER_MAX_END_MS).contains(&end);
        let left_ok = |left: u32| (1..=TIMER_MAX_REMAINING_MS).contains(&left);
        let consistent = match (self.state, self.ends_at_ms, self.remaining_ms) {
            (TimerState::Idle, None, None) => true,
            (TimerState::Running, Some(end), None) => end_ok(end),
            (TimerState::Paused, None, Some(left)) => left_ok(left),
            _ => false,
        };
        if consistent {
            Ok(())
        } else {
            Err(invalid(
                "a running timer needs its end, a paused one its time left, an idle one neither",
            ))
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Place {
    pub name: String,
    pub latitude_centi: i32,
    pub longitude_centi: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct ClocksConfig {
    pub size: BlockSize,
    pub zones: Vec<String>,
    pub place: Option<Place>,
}

impl Default for ClocksConfig {
    fn default() -> Self {
        Self {
            size: BlockSize::Normal,
            zones: Vec::new(),
            place: None,
        }
    }
}

fn is_zone_id(zone: &str) -> bool {
    let segment_ok = |segment: &str| {
        !segment.is_empty()
            && segment
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '+' | '-'))
    };
    let mut segments = zone.split('/');
    let count = zone.split('/').count();
    (1..=3).contains(&count) && segments.all(segment_ok)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct TableConfig {
    pub size: BlockSize,
    pub header: bool,
    pub rows: Vec<Vec<String>>,
}

impl Default for TableConfig {
    fn default() -> Self {
        Self {
            size: BlockSize::Wide,
            header: true,
            rows: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SnippetLanguage {
    #[default]
    Text,
    Bash,
    C,
    Cpp,
    Css,
    Diff,
    Go,
    Java,
    Javascript,
    Json,
    Markdown,
    Python,
    Rust,
    Sql,
    Typescript,
    Xml,
    Yaml,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct SnippetConfig {
    pub size: BlockSize,
    pub language: SnippetLanguage,
    pub filename: String,
    pub code: String,
    pub line_numbers: bool,
}

impl Default for SnippetConfig {
    fn default() -> Self {
        Self {
            size: BlockSize::Wide,
            language: SnippetLanguage::default(),
            filename: String::new(),
            code: String::new(),
            line_numbers: false,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChartSource {
    #[default]
    List,
    Label,
    Assignee,
    Due,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChartStyle {
    #[default]
    Bars,
    Donut,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct ChartConfig {
    pub size: BlockSize,
    pub source: ChartSource,
    pub style: ChartStyle,
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
    Overdue(OverdueConfig),
    Chart(ChartConfig),
    Snippet(SnippetConfig),
    Table(TableConfig),
    Clocks(ClocksConfig),
    Timer(TimerConfig),
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
            Self::Overdue(_) => ListKind::Overdue,
            Self::Chart(_) => ListKind::Chart,
            Self::Snippet(_) => ListKind::Snippet,
            Self::Table(_) => ListKind::Table,
            Self::Clocks(_) => ListKind::Clocks,
            Self::Timer(_) => ListKind::Timer,
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
            ListKind::Overdue => Ok(Self::Overdue(serde_json::from_value(value).map_err(from)?)),
            ListKind::Chart => Ok(Self::Chart(serde_json::from_value(value).map_err(from)?)),
            ListKind::Snippet => {
                let mut snippet: SnippetConfig = serde_json::from_value(value).map_err(from)?;
                snippet.filename = snippet.filename.trim().to_string();
                clean_text(&snippet.filename, BLOCK_TITLE_MAX_CHARS, false)?;
                snippet.code = snippet.code.replace("\r\n", "\n").replace('\r', "\n");
                clean_text(&snippet.code, SNIPPET_MAX_CHARS, true)?;
                if snippet.code.lines().count() > SNIPPET_MAX_LINES {
                    return Err(invalid(format!("at most {SNIPPET_MAX_LINES} lines")));
                }
                Ok(Self::Snippet(snippet))
            }
            ListKind::Table => {
                let mut table: TableConfig = serde_json::from_value(value).map_err(from)?;
                if table.rows.len() > TABLE_MAX_ROWS {
                    return Err(invalid(format!("at most {TABLE_MAX_ROWS} rows")));
                }
                let width = table.rows.iter().map(Vec::len).max().unwrap_or(0);
                if width > TABLE_MAX_COLUMNS {
                    return Err(invalid(format!("at most {TABLE_MAX_COLUMNS} columns")));
                }
                let mut bytes = 0;
                for row in &mut table.rows {
                    row.resize(width, String::new());
                    for cell in row.iter() {
                        clean_text(cell, TABLE_CELL_MAX_CHARS, false)?;
                        bytes += cell.len();
                    }
                }
                if bytes > TABLE_MAX_BYTES {
                    return Err(invalid("the table holds too much text"));
                }
                Ok(Self::Table(table))
            }
            ListKind::Clocks => {
                let mut clocks: ClocksConfig = serde_json::from_value(value).map_err(from)?;
                if clocks.zones.len() > CLOCKS_MAX_ZONES {
                    return Err(invalid(format!("at most {CLOCKS_MAX_ZONES} time zones")));
                }
                for (index, zone) in clocks.zones.iter().enumerate() {
                    if zone.chars().count() > ZONE_MAX_CHARS || !is_zone_id(zone) {
                        return Err(invalid("that is not a time zone name"));
                    }
                    if clocks.zones[..index].contains(zone) {
                        return Err(invalid("each time zone can be added once"));
                    }
                }
                if let Some(place) = &mut clocks.place {
                    place.name = place.name.trim().to_string();
                    if place.name.is_empty() {
                        return Err(invalid("name the place the weather is for"));
                    }
                    clean_text(&place.name, PLACE_NAME_MAX_CHARS, false)?;
                    if !(-9_000..=9_000).contains(&place.latitude_centi)
                        || !(-18_000..=18_000).contains(&place.longitude_centi)
                    {
                        return Err(invalid("that position is not on Earth"));
                    }
                }
                Ok(Self::Clocks(clocks))
            }
            ListKind::Timer => {
                let timer: TimerConfig = serde_json::from_value(value).map_err(from)?;
                timer.check()?;
                Ok(Self::Timer(timer))
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
            Self::Overdue(config) => serde_json::to_value(config),
            Self::Chart(config) => serde_json::to_value(config),
            Self::Snippet(config) => serde_json::to_value(config),
            Self::Table(config) => serde_json::to_value(config),
            Self::Clocks(config) => serde_json::to_value(config),
            Self::Timer(config) => serde_json::to_value(config),
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
            ListKind::Overdue,
            ListKind::Chart,
            ListKind::Snippet,
            ListKind::Table,
            ListKind::Clocks,
            ListKind::Timer,
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

    #[test]
    fn a_timer_starts_idle_on_a_twenty_five_minute_focus() {
        let config = BlockConfig::parse(ListKind::Timer, json!({})).expect("parse");

        assert_eq!(config, BlockConfig::Timer(TimerConfig::default()));
        assert_eq!(
            config.to_value(),
            json!({
                "size": "normal", "mode": "focus", "focus_minutes": 25, "short_minutes": 5,
                "long_minutes": 15, "state": "idle", "ends_at_ms": null, "remaining_ms": null,
                "cycle": 0
            })
        );
    }

    #[test]
    fn a_timer_keeps_a_running_a_paused_and_an_idle_state_as_they_are() {
        for stored in [
            json!({ "state": "running", "ends_at_ms": 1_800_000_000_000_i64, "mode": "short_break", "cycle": 3 }),
            json!({ "state": "paused", "remaining_ms": 754_000, "mode": "long_break" }),
            json!({ "state": "idle", "focus_minutes": 50, "short_minutes": 10, "long_minutes": 30 }),
        ] {
            let config = BlockConfig::parse(ListKind::Timer, stored.clone()).expect("parse");
            let again = BlockConfig::parse(ListKind::Timer, config.to_value()).expect("parse");

            assert_eq!(config, again, "{stored}");
        }
    }

    #[test]
    fn a_timer_refuses_a_state_that_cannot_be_true() {
        for bad in [
            json!({ "state": "running" }),
            json!({ "state": "running", "ends_at_ms": 1_800_000_000_000_i64, "remaining_ms": 5 }),
            json!({ "state": "running", "ends_at_ms": 5 }),
            json!({ "state": "running", "ends_at_ms": 9_999_999_999_999_i64 }),
            json!({ "state": "paused" }),
            json!({ "state": "paused", "remaining_ms": 0 }),
            json!({ "state": "paused", "remaining_ms": TIMER_MAX_REMAINING_MS + 1 }),
            json!({ "state": "paused", "remaining_ms": 5, "ends_at_ms": 1_800_000_000_000_i64 }),
            json!({ "state": "idle", "ends_at_ms": 1_800_000_000_000_i64 }),
            json!({ "state": "idle", "remaining_ms": 5 }),
            json!({ "state": "done" }),
        ] {
            assert!(
                BlockConfig::parse(ListKind::Timer, bad.clone()).is_err(),
                "{bad}"
            );
        }
    }

    #[test]
    fn a_timer_refuses_lengths_modes_and_fields_outside_what_it_offers() {
        for bad in [
            json!({ "focus_minutes": 0 }),
            json!({ "focus_minutes": TIMER_FOCUS_MAX_MINUTES + 1 }),
            json!({ "short_minutes": TIMER_SHORT_MAX_MINUTES + 1 }),
            json!({ "long_minutes": 0 }),
            json!({ "focus_minutes": -5 }),
            json!({ "focus_minutes": 2.5 }),
            json!({ "mode": "nap" }),
            json!({ "cycle": TIMER_MAX_CYCLE + 1 }),
            json!({ "sound": true }),
            json!([]),
        ] {
            assert!(
                BlockConfig::parse(ListKind::Timer, bad.clone()).is_err(),
                "{bad}"
            );
        }
        let at_the_limits = json!({
            "focus_minutes": TIMER_FOCUS_MAX_MINUTES, "short_minutes": TIMER_SHORT_MAX_MINUTES,
            "long_minutes": TIMER_LONG_MAX_MINUTES, "cycle": TIMER_MAX_CYCLE
        });
        assert!(BlockConfig::parse(ListKind::Timer, at_the_limits).is_ok());
    }

    #[test]
    fn a_clocks_block_starts_with_no_zone_and_no_weather() {
        let config = BlockConfig::parse(ListKind::Clocks, json!({})).expect("parse");

        assert_eq!(config, BlockConfig::Clocks(ClocksConfig::default()));
        assert_eq!(
            config.to_value(),
            json!({ "size": "normal", "zones": [], "place": null })
        );
    }

    #[test]
    fn a_clocks_block_keeps_its_zones_in_order_and_a_rounded_place() {
        let stored = json!({
            "size": "wide",
            "zones": ["Europe/Paris", "America/Argentina/Buenos_Aires", "Etc/GMT+5", "UTC"],
            "place": { "name": "Paris", "latitude_centi": 4886, "longitude_centi": 235 }
        });

        let config = BlockConfig::parse(ListKind::Clocks, stored.clone()).expect("parse");

        assert_eq!(config.to_value(), stored);
        let trimmed = BlockConfig::parse(
            ListKind::Clocks,
            json!({ "place": { "name": "  Lyon ", "latitude_centi": 4576, "longitude_centi": 484 } }),
        )
        .expect("parse");
        assert_eq!(trimmed.to_value()["place"]["name"], "Lyon");
    }

    #[test]
    fn a_clocks_block_refuses_odd_zones_too_many_duplicates_and_off_planet_places() {
        let seven: Vec<String> = (0..=CLOCKS_MAX_ZONES)
            .map(|i| format!("Etc/GMT+{i}"))
            .collect();
        let long = format!("Europe/{}", "a".repeat(ZONE_MAX_CHARS));
        for bad in [
            json!({ "zones": seven }),
            json!({ "zones": ["Europe/Paris", "Europe/Paris"] }),
            json!({ "zones": [long] }),
            json!({ "zones": [""] }),
            json!({ "zones": ["Europe//Paris"] }),
            json!({ "zones": ["/Europe/Paris"] }),
            json!({ "zones": ["Europe/Paris/../../etc"] }),
            json!({ "zones": ["Europe/Pa ris"] }),
            json!({ "zones": ["Europe/Paris\n"] }),
            json!({ "zones": ["<script>"] }),
            json!({ "zones": [5] }),
            json!({ "place": { "name": "", "latitude_centi": 0, "longitude_centi": 0 } }),
            json!({ "place": { "name": "x", "latitude_centi": 9001, "longitude_centi": 0 } }),
            json!({ "place": { "name": "x", "latitude_centi": 0, "longitude_centi": -18001 } }),
            json!({ "place": { "name": "x", "latitude_centi": 48.86, "longitude_centi": 0 } }),
            json!({ "place": { "name": "x", "latitude_centi": 0 } }),
            json!({ "place": { "name": "a\nb", "latitude_centi": 0, "longitude_centi": 0 } }),
            json!({ "place": { "name": "x", "latitude_centi": 0, "longitude_centi": 0, "country": "FR" } }),
            json!({ "api_key": "x" }),
        ] {
            assert!(
                BlockConfig::parse(ListKind::Clocks, bad.clone()).is_err(),
                "{bad}"
            );
        }
        let six: Vec<String> = (0..CLOCKS_MAX_ZONES)
            .map(|i| format!("Etc/GMT+{i}"))
            .collect();
        assert!(BlockConfig::parse(ListKind::Clocks, json!({ "zones": six })).is_ok());
    }

    #[test]
    fn a_table_starts_empty_with_a_header_row() {
        let config = BlockConfig::parse(ListKind::Table, json!({})).expect("parse");

        assert_eq!(config, BlockConfig::Table(TableConfig::default()));
        assert_eq!(
            config.to_value(),
            json!({ "size": "wide", "header": true, "rows": [] })
        );
    }

    #[test]
    fn a_table_keeps_its_cells_exactly_and_pads_short_rows() {
        let config = BlockConfig::parse(
            ListKind::Table,
            json!({ "rows": [["Name", "Cost", "Note"], ["Rent", "800"], ["=SUM(A1)", " 5 ", "é"]] }),
        )
        .expect("parse");

        assert_eq!(
            config.to_value()["rows"],
            json!([
                ["Name", "Cost", "Note"],
                ["Rent", "800", ""],
                ["=SUM(A1)", " 5 ", "é"]
            ])
        );
    }

    #[test]
    fn a_table_refuses_too_many_rows_columns_text_and_hidden_characters() {
        let cell = "x".repeat(TABLE_CELL_MAX_CHARS + 1);
        let wide_row: Vec<String> = (0..=TABLE_MAX_COLUMNS).map(|_| "a".to_string()).collect();
        let tall: Vec<Vec<String>> = (0..=TABLE_MAX_ROWS)
            .map(|_| vec!["a".to_string()])
            .collect();
        let heavy_cell = "é".repeat(TABLE_CELL_MAX_CHARS);
        let heavy: Vec<Vec<String>> = (0..TABLE_MAX_ROWS)
            .map(|_| vec![heavy_cell.clone(); 3])
            .collect();
        for bad in [
            json!({ "rows": [[cell]] }),
            json!({ "rows": [wide_row] }),
            json!({ "rows": tall }),
            json!({ "rows": heavy }),
            json!({ "rows": [["a\tb"]] }),
            json!({ "rows": [["a\nb"]] }),
            json!({ "rows": [["nul\u{0}"]] }),
            json!({ "rows": [[5]] }),
            json!({ "rows": "a,b" }),
            json!({ "formula": "SUM" }),
            json!([]),
        ] {
            assert!(
                BlockConfig::parse(ListKind::Table, bad.clone()).is_err(),
                "{bad}"
            );
        }
        let widest: Vec<String> = (0..TABLE_MAX_COLUMNS).map(|_| "a".to_string()).collect();
        let tallest: Vec<Vec<String>> = (0..TABLE_MAX_ROWS).map(|_| widest.clone()).collect();
        assert!(BlockConfig::parse(ListKind::Table, json!({ "rows": tallest })).is_ok());
    }

    #[test]
    fn a_snippet_starts_empty_wide_and_as_plain_text() {
        let config = BlockConfig::parse(ListKind::Snippet, json!({})).expect("parse");

        assert_eq!(config, BlockConfig::Snippet(SnippetConfig::default()));
        assert_eq!(
            config.to_value(),
            json!({ "size": "wide", "language": "text", "filename": "", "code": "", "line_numbers": false })
        );
    }

    #[test]
    fn a_snippet_keeps_its_code_exactly_and_trims_only_the_filename() {
        let code = "fn main() {\n\tprintln!(\"héllo\");\n}\n";
        let config = BlockConfig::parse(
            ListKind::Snippet,
            json!({ "language": "rust", "filename": "  main.rs  ", "code": code, "line_numbers": true }),
        )
        .expect("parse");

        assert_eq!(
            config.to_value(),
            json!({ "size": "wide", "language": "rust", "filename": "main.rs", "code": code, "line_numbers": true })
        );
    }

    #[test]
    fn a_snippet_turns_windows_line_endings_into_plain_ones() {
        let config = BlockConfig::parse(ListKind::Snippet, json!({ "code": "one\r\ntwo\rthree" }))
            .expect("parse");

        assert_eq!(config.to_value()["code"], "one\ntwo\nthree");
    }

    #[test]
    fn a_snippet_refuses_too_much_hidden_characters_and_unknown_things() {
        let long = "x".repeat(SNIPPET_MAX_CHARS + 1);
        let tall = "a\n".repeat(SNIPPET_MAX_LINES + 1);
        for bad in [
            json!({ "code": long }),
            json!({ "code": tall }),
            json!({ "code": "bell\u{7}" }),
            json!({ "code": "nul\u{0}" }),
            json!({ "language": "brainfuck" }),
            json!({ "filename": "two\nlines" }),
            json!({ "filename": "x".repeat(BLOCK_TITLE_MAX_CHARS + 1) }),
            json!({ "run": true }),
            json!({ "code": 5 }),
            json!([]),
        ] {
            assert!(
                BlockConfig::parse(ListKind::Snippet, bad.clone()).is_err(),
                "{bad}"
            );
        }
        let at_the_limits = "é".repeat(SNIPPET_MAX_CHARS);
        assert!(BlockConfig::parse(ListKind::Snippet, json!({ "code": at_the_limits })).is_ok());
        let lines = "a\n".repeat(SNIPPET_MAX_LINES);
        assert!(BlockConfig::parse(ListKind::Snippet, json!({ "code": lines })).is_ok());
    }

    #[test]
    fn a_chart_starts_as_bars_of_cards_per_list() {
        let config = BlockConfig::parse(ListKind::Chart, json!({})).expect("parse");

        assert_eq!(config, BlockConfig::Chart(ChartConfig::default()));
        assert_eq!(
            config.to_value(),
            json!({ "size": "normal", "source": "list", "style": "bars" })
        );
    }

    #[test]
    fn a_chart_keeps_what_it_counts_and_how_it_draws_it() {
        for source in ["list", "label", "assignee", "due"] {
            let stored = json!({ "size": "wide", "source": source, "style": "donut" });

            let config = BlockConfig::parse(ListKind::Chart, stored.clone()).expect("parse");

            assert_eq!(config.to_value(), stored);
        }
    }

    #[test]
    fn a_chart_refuses_unknown_sources_styles_and_fields() {
        for bad in [
            json!({ "source": "priority" }),
            json!({ "style": "pie" }),
            json!({ "colour": "red" }),
            json!({ "source": 3 }),
            json!([]),
        ] {
            assert!(
                BlockConfig::parse(ListKind::Chart, bad.clone()).is_err(),
                "{bad}"
            );
        }
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
