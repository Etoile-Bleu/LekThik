use super::error::BoardsError;

pub const TITLE_MAX_CHARS: usize = 120;
pub const LABEL_NAME_MAX_CHARS: usize = 40;
pub const DESCRIPTION_MAX_CHARS: usize = 10_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Title(String);

impl Title {
    pub fn parse(raw: &str) -> Result<Self, BoardsError> {
        Self::parse_up_to(raw, TITLE_MAX_CHARS)
    }

    pub fn parse_label_name(raw: &str) -> Result<Self, BoardsError> {
        Self::parse_up_to(raw, LABEL_NAME_MAX_CHARS)
    }

    fn parse_up_to(raw: &str, max_chars: usize) -> Result<Self, BoardsError> {
        let trimmed = raw.trim();

        if trimmed.is_empty() {
            return Err(BoardsError::Invalid(
                "the name must not be empty".to_string(),
            ));
        }
        if trimmed.chars().count() > max_chars {
            return Err(BoardsError::Invalid(format!(
                "the name must be at most {max_chars} characters"
            )));
        }
        if trimmed.chars().any(char::is_control) {
            return Err(BoardsError::Invalid(
                "the name must not contain control characters".to_string(),
            ));
        }

        Ok(Self(trimmed.to_string()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn into_string(self) -> String {
        self.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Description(String);

impl Description {
    pub fn parse(raw: &str) -> Result<Self, BoardsError> {
        let trimmed = raw.trim_end();

        if trimmed.chars().count() > DESCRIPTION_MAX_CHARS {
            return Err(BoardsError::Invalid(format!(
                "the description must be at most {DESCRIPTION_MAX_CHARS} characters"
            )));
        }
        if trimmed
            .chars()
            .any(|character| character.is_control() && !matches!(character, '\n' | '\r' | '\t'))
        {
            return Err(BoardsError::Invalid(
                "the description must not contain control characters".to_string(),
            ));
        }

        Ok(Self(trimmed.to_string()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn into_string(self) -> String {
        self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn title_is_trimmed() {
        let title = Title::parse("  Roadmap  ").expect("a padded title should parse");
        assert_eq!(title.as_str(), "Roadmap");
    }

    #[test]
    fn title_rejects_blank_input() {
        assert!(matches!(Title::parse("   "), Err(BoardsError::Invalid(_))));
    }

    #[test]
    fn title_rejects_control_characters() {
        assert!(matches!(
            Title::parse("line\nbreak"),
            Err(BoardsError::Invalid(_))
        ));
    }

    #[test]
    fn title_counts_characters_not_bytes() {
        let accented = "é".repeat(TITLE_MAX_CHARS);
        assert!(Title::parse(&accented).is_ok());
        assert!(Title::parse(&format!("{accented}é")).is_err());
    }

    #[test]
    fn label_names_are_shorter_than_titles() {
        let long = "a".repeat(LABEL_NAME_MAX_CHARS + 1);
        assert!(Title::parse(&long).is_ok());
        assert!(Title::parse_label_name(&long).is_err());
    }

    #[test]
    fn description_keeps_inner_line_breaks_but_trims_the_end() {
        let description = Description::parse("one\ntwo\n\n").expect("line breaks are allowed");
        assert_eq!(description.as_str(), "one\ntwo");
    }

    #[test]
    fn description_may_be_empty() {
        assert_eq!(
            Description::parse("").map(Description::into_string),
            Ok(String::new())
        );
    }

    #[test]
    fn description_rejects_other_control_characters() {
        assert!(Description::parse("bell\u{7}").is_err());
    }

    #[test]
    fn description_has_a_length_cap() {
        let too_long = "a".repeat(DESCRIPTION_MAX_CHARS + 1);
        assert!(Description::parse(&too_long).is_err());
    }
}
