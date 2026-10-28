use domain::boards::{Activity, Comment, Person, TimelineItem};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Serialize, ToSchema)]
pub struct PersonDto {
    pub id: Uuid,
    pub username: String,
}

impl From<Person> for PersonDto {
    fn from(person: Person) -> Self {
        Self {
            id: person.id,
            username: person.username,
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct CommentDto {
    pub id: Uuid,
    pub card_id: Uuid,
    pub author: Option<PersonDto>,
    pub body: String,
    pub created_at: String,
    pub edited_at: Option<String>,
}

impl From<Comment> for CommentDto {
    fn from(comment: Comment) -> Self {
        Self {
            id: comment.id,
            card_id: comment.card_id,
            author: comment.author.map(Into::into),
            body: comment.body,
            created_at: comment.created_at,
            edited_at: comment.edited_at,
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct ActivityDto {
    pub id: Uuid,
    pub actor: Option<PersonDto>,
    pub kind: String,
    pub subject: Option<PersonDto>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub created_at: String,
}

impl From<Activity> for ActivityDto {
    fn from(activity: Activity) -> Self {
        Self {
            id: activity.id,
            actor: activity.actor.map(Into::into),
            kind: activity.kind.as_str().to_string(),
            subject: activity.subject.map(Into::into),
            from: activity.from,
            to: activity.to,
            created_at: activity.created_at,
        }
    }
}

#[derive(Serialize, ToSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TimelineItemDto {
    Comment(CommentDto),
    Activity(ActivityDto),
}

impl From<TimelineItem> for TimelineItemDto {
    fn from(item: TimelineItem) -> Self {
        match item {
            TimelineItem::Comment(comment) => Self::Comment(comment.into()),
            TimelineItem::Activity(activity) => Self::Activity(activity.into()),
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct TimelineResponseDto {
    pub items: Vec<TimelineItemDto>,
}

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CommentRequestDto {
    pub body: String,
}
