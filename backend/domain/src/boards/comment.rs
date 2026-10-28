use async_trait::async_trait;
use uuid::Uuid;

use super::error::BoardsError;

pub const COMMENT_MAX_CHARS: usize = 5_000;
pub const MAX_COMMENTS_PER_CARD: i64 = 500;
pub const MAX_COMMENTS_PER_MINUTE: i64 = 20;
pub const TIMELINE_LIMIT: i64 = 200;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommentBody(String);

impl CommentBody {
    pub fn parse(raw: &str) -> Result<Self, BoardsError> {
        let text = raw.replace("\r\n", "\n").replace('\r', "\n");
        let text = text.trim();
        if text.is_empty() {
            return Err(BoardsError::Invalid("write something".to_string()));
        }
        if text.chars().count() > COMMENT_MAX_CHARS {
            return Err(BoardsError::Invalid(format!(
                "at most {COMMENT_MAX_CHARS} characters"
            )));
        }
        if text
            .chars()
            .any(|c| c.is_control() && !matches!(c, '\n' | '\t'))
        {
            return Err(BoardsError::Invalid(
                "control characters are not allowed".to_string(),
            ));
        }
        Ok(Self(text.to_string()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn into_string(self) -> String {
        self.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Person {
    pub id: Uuid,
    pub username: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Comment {
    pub id: Uuid,
    pub card_id: Uuid,
    pub author: Option<Person>,
    pub body: String,
    pub created_at: String,
    pub edited_at: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActivityKind {
    Created,
    Renamed,
    Described,
    DueSet,
    DueCleared,
    Moved,
    LabelAdded,
    LabelRemoved,
    Assigned,
    Unassigned,
}

impl ActivityKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Created => "created",
            Self::Renamed => "renamed",
            Self::Described => "described",
            Self::DueSet => "due_set",
            Self::DueCleared => "due_cleared",
            Self::Moved => "moved",
            Self::LabelAdded => "label_added",
            Self::LabelRemoved => "label_removed",
            Self::Assigned => "assigned",
            Self::Unassigned => "unassigned",
        }
    }

    pub fn parse(value: &str) -> Result<Self, BoardsError> {
        match value {
            "created" => Ok(Self::Created),
            "renamed" => Ok(Self::Renamed),
            "described" => Ok(Self::Described),
            "due_set" => Ok(Self::DueSet),
            "due_cleared" => Ok(Self::DueCleared),
            "moved" => Ok(Self::Moved),
            "label_added" => Ok(Self::LabelAdded),
            "label_removed" => Ok(Self::LabelRemoved),
            "assigned" => Ok(Self::Assigned),
            "unassigned" => Ok(Self::Unassigned),
            _ => Err(BoardsError::Repository(format!(
                "unknown activity kind {value}"
            ))),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Activity {
    pub id: Uuid,
    pub actor: Option<Person>,
    pub kind: ActivityKind,
    pub subject: Option<Person>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TimelineItem {
    Comment(Comment),
    Activity(Activity),
}

impl TimelineItem {
    pub fn created_at(&self) -> &str {
        match self {
            Self::Comment(comment) => &comment.created_at,
            Self::Activity(activity) => &activity.created_at,
        }
    }
}

#[cfg_attr(feature = "test-utils", mockall::automock)]
#[async_trait]
pub trait CommentRepo: Send + Sync {
    /// What was said and what happened on a card, oldest first, the latest 200 at most.
    async fn timeline(
        &self,
        user_id: Uuid,
        card_id: Uuid,
    ) -> Result<Vec<TimelineItem>, BoardsError>;
    async fn add(
        &self,
        user_id: Uuid,
        card_id: Uuid,
        body: CommentBody,
    ) -> Result<Comment, BoardsError>;
    /// Only the author can edit.
    async fn edit(
        &self,
        user_id: Uuid,
        card_id: Uuid,
        comment_id: Uuid,
        body: CommentBody,
    ) -> Result<Comment, BoardsError>;
    /// The author can delete, and so can an admin or an owner.
    async fn delete(
        &self,
        user_id: Uuid,
        card_id: Uuid,
        comment_id: Uuid,
    ) -> Result<(), BoardsError>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_comment_is_trimmed_and_keeps_its_line_breaks_and_tabs() {
        let body = CommentBody::parse("  First line\r\n\tsecond, with é  \n").expect("parse");

        assert_eq!(body.as_str(), "First line\n\tsecond, with é");
    }

    #[test]
    fn an_empty_comment_is_refused() {
        for blank in ["", "   ", "\n\t\r\n"] {
            assert!(CommentBody::parse(blank).is_err(), "{blank:?}");
        }
    }

    #[test]
    fn a_comment_is_capped_by_characters_not_bytes() {
        assert!(CommentBody::parse(&"é".repeat(COMMENT_MAX_CHARS)).is_ok());
        assert!(CommentBody::parse(&"é".repeat(COMMENT_MAX_CHARS + 1)).is_err());
    }

    #[test]
    fn hidden_characters_are_refused() {
        for bad in ["bell\u{7}", "nul\u{0}", "esc\u{1b}[31m", "del\u{7f}"] {
            assert!(CommentBody::parse(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn html_is_kept_as_text_for_the_screen_to_escape() {
        let body = CommentBody::parse("<script>alert(1)</script>").expect("parse");

        assert_eq!(body.as_str(), "<script>alert(1)</script>");
    }

    #[test]
    fn every_kind_of_activity_round_trips_through_its_name() {
        for kind in [
            ActivityKind::Created,
            ActivityKind::Renamed,
            ActivityKind::Described,
            ActivityKind::DueSet,
            ActivityKind::DueCleared,
            ActivityKind::Moved,
            ActivityKind::LabelAdded,
            ActivityKind::LabelRemoved,
            ActivityKind::Assigned,
            ActivityKind::Unassigned,
        ] {
            assert_eq!(ActivityKind::parse(kind.as_str()), Ok(kind));
        }
        assert!(ActivityKind::parse("exploded").is_err());
    }
}
