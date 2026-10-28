use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::counter::COUNTER_LABEL_MAX_CHARS;
use super::{BlockSize, clean_text, read};
use crate::boards::error::BoardsError;

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

pub(super) fn parse(value: Value) -> Result<ProgressConfig, BoardsError> {
    let mut progress: ProgressConfig = read(value)?;
    progress.label = progress.label.trim().to_string();
    clean_text(&progress.label, COUNTER_LABEL_MAX_CHARS, false)?;
    Ok(progress)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::super::{BlockConfig, ListKind};
    use super::*;

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
