use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{BlockSize, clean_text, invalid, read};
use crate::boards::error::BoardsError;

pub const POLL_QUESTION_MAX_CHARS: usize = 200;
pub const POLL_OPTION_MAX_CHARS: usize = 80;
pub const POLL_OPTION_ID_MAX_CHARS: usize = 12;
pub const POLL_MIN_OPTIONS: usize = 2;
pub const POLL_MAX_OPTIONS: usize = 10;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PollOption {
    pub id: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct PollConfig {
    pub size: BlockSize,
    pub question: String,
    pub options: Vec<PollOption>,
    pub show_voters: bool,
    pub closed: bool,
}

impl PollConfig {
    fn check(&mut self) -> Result<(), BoardsError> {
        self.question = self.question.trim().to_string();
        if self.question.is_empty() {
            return Err(invalid("ask a question"));
        }
        clean_text(&self.question, POLL_QUESTION_MAX_CHARS, false)?;
        if !(POLL_MIN_OPTIONS..=POLL_MAX_OPTIONS).contains(&self.options.len()) {
            return Err(invalid(format!(
                "a poll has {POLL_MIN_OPTIONS} to {POLL_MAX_OPTIONS} options"
            )));
        }
        for index in 0..self.options.len() {
            let text = self.options[index].text.trim().to_string();
            if text.is_empty() {
                return Err(invalid("an option needs some text"));
            }
            clean_text(&text, POLL_OPTION_MAX_CHARS, false)?;
            self.options[index].text = text;
            let id = &self.options[index].id;
            let well_formed = (1..=POLL_OPTION_ID_MAX_CHARS).contains(&id.len())
                && id
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit());
            if !well_formed {
                return Err(invalid(
                    "an option id is 1 to 12 lowercase letters or digits",
                ));
            }
            if self.options[..index].iter().any(|other| other.id == *id) {
                return Err(invalid("each option needs its own id"));
            }
            if self.options[..index]
                .iter()
                .any(|other| other.text.to_lowercase() == self.options[index].text.to_lowercase())
            {
                return Err(invalid("each option needs its own text"));
            }
        }
        Ok(())
    }

    pub fn has_option(&self, option_id: &str) -> bool {
        self.options.iter().any(|option| option.id == option_id)
    }
}

pub(super) fn parse(value: Value) -> Result<PollConfig, BoardsError> {
    let mut poll: PollConfig = read(value)?;
    poll.check()?;
    Ok(poll)
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};

    use super::super::{BlockConfig, ListKind};
    use super::*;

    fn poll_json(question: &str, options: &[(&str, &str)]) -> Value {
        json!({
            "question": question,
            "options": options
                .iter()
                .map(|(id, text)| json!({ "id": id, "text": text }))
                .collect::<Vec<_>>(),
        })
    }

    #[test]
    fn a_poll_is_kept_with_its_text_trimmed() {
        let value = poll_json("  Where?  ", &[("a", " Pizza "), ("b", "Ramen")]);

        let config = BlockConfig::parse(ListKind::Poll, value).expect("parse");

        let poll = match &config {
            BlockConfig::Poll(poll) => Some(poll.clone()),
            _ => None,
        }
        .expect("a poll");
        assert_eq!(poll.question, "Where?");
        assert_eq!(poll.options[0].text, "Pizza");
        assert!(!poll.show_voters && !poll.closed);
        assert!(poll.has_option("b") && !poll.has_option("c"));
        assert_eq!(config.kind(), ListKind::Poll);
        assert_eq!(
            BlockConfig::parse(ListKind::Poll, config.to_value()),
            Ok(config)
        );
    }

    #[test]
    fn a_poll_needs_two_to_ten_options() {
        let ids: Vec<String> = (0..11).map(|index| format!("o{index}")).collect();
        let pairs = |count: usize| -> Vec<(&str, String)> {
            ids.iter()
                .take(count)
                .map(|id| (id.as_str(), format!("Option {id}")))
                .collect()
        };
        let build = |count: usize| {
            let owned = pairs(count);
            let borrowed: Vec<(&str, &str)> = owned
                .iter()
                .map(|(id, text)| (*id, text.as_str()))
                .collect();
            BlockConfig::parse(ListKind::Poll, poll_json("Pick", &borrowed))
        };

        assert!(build(1).is_err());
        assert!(build(2).is_ok());
        assert!(build(10).is_ok());
        assert!(build(11).is_err());
    }

    #[test]
    fn a_poll_refuses_what_cannot_be_voted_on() {
        let long = "x".repeat(POLL_QUESTION_MAX_CHARS + 1);
        let long_option = "y".repeat(POLL_OPTION_MAX_CHARS + 1);
        for bad in [
            poll_json("", &[("a", "One"), ("b", "Two")]),
            poll_json(&long, &[("a", "One"), ("b", "Two")]),
            poll_json("Pick", &[("a", "One"), ("b", "  ")]),
            poll_json("Pick", &[("a", "One"), ("b", &long_option)]),
            poll_json("Pick", &[("a", "One"), ("a", "Two")]),
            poll_json("Pick", &[("a", "Same"), ("b", "SAME")]),
            poll_json("Pick", &[("A", "One"), ("b", "Two")]),
            poll_json("Pick", &[("", "One"), ("b", "Two")]),
            poll_json("Pick", &[("abcdefghijklm", "One"), ("b", "Two")]),
            poll_json("Pi\u{7}ck", &[("a", "One"), ("b", "Two")]),
            json!({ "question": "Pick", "options": [], "extra": 1 }),
            json!([]),
        ] {
            assert!(
                BlockConfig::parse(ListKind::Poll, bad.clone()).is_err(),
                "{bad}"
            );
        }
        assert!(BlockConfig::parse(ListKind::Poll, Value::Null).is_err());
    }
}
