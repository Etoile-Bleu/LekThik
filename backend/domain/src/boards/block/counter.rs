use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::{BlockSize, clean_text, invalid, read};
use crate::boards::due_date::DueDate;
use crate::boards::error::BoardsError;

pub const COUNTER_LABEL_MAX_CHARS: usize = 60;

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
pub struct CounterConfig {
    pub size: BlockSize,
    pub metric: CounterMetric,
    /// Names the number, for instance "Days to launch".
    pub label: String,
    pub done_list_id: Option<Uuid>,
    /// `YYYY-MM-DD`, for the days left.
    pub date: Option<String>,
}

pub(super) fn parse(value: Value) -> Result<CounterConfig, BoardsError> {
    let mut counter: CounterConfig = read(value)?;
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
    Ok(counter)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::super::{BlockConfig, ListKind};
    use super::*;

    fn counter_of(config: BlockConfig) -> Option<CounterConfig> {
        match config {
            BlockConfig::Counter(counter) => Some(counter),
            _ => None,
        }
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
}
