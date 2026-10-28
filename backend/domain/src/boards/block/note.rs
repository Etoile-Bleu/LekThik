use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{BlockSize, clean_text, read};
use crate::boards::error::BoardsError;

pub const NOTE_MAX_CHARS: usize = 10_000;

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct NoteConfig {
    pub size: BlockSize,
    pub text: String,
}

pub(super) fn parse(value: Value) -> Result<NoteConfig, BoardsError> {
    let note: NoteConfig = read(value)?;
    clean_text(&note.text, NOTE_MAX_CHARS, true)?;
    Ok(note)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::super::{BlockConfig, ListKind};
    use super::*;

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
}
