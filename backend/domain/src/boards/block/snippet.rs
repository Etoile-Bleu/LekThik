use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{BLOCK_TITLE_MAX_CHARS, BlockSize, clean_text, invalid, read};
use crate::boards::error::BoardsError;

pub const SNIPPET_MAX_CHARS: usize = 12_000;
pub const SNIPPET_MAX_LINES: usize = 500;

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

pub(super) fn parse(value: Value) -> Result<SnippetConfig, BoardsError> {
    let mut snippet: SnippetConfig = read(value)?;
    snippet.filename = snippet.filename.trim().to_string();
    clean_text(&snippet.filename, BLOCK_TITLE_MAX_CHARS, false)?;
    snippet.code = snippet.code.replace("\r\n", "\n").replace('\r', "\n");
    clean_text(&snippet.code, SNIPPET_MAX_CHARS, true)?;
    if snippet.code.lines().count() > SNIPPET_MAX_LINES {
        return Err(invalid(format!("at most {SNIPPET_MAX_LINES} lines")));
    }
    Ok(snippet)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::super::{BlockConfig, ListKind};
    use super::*;

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
}
