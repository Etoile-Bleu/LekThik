use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{BlockSize, read};
use crate::boards::error::BoardsError;

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

pub(super) fn parse(value: Value) -> Result<ChartConfig, BoardsError> {
    read(value)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::super::{BlockConfig, ListKind};
    use super::*;

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
}
