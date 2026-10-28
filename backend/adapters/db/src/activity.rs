use domain::boards::{ActivityKind, BoardsError};
use sqlx::PgConnection;
use uuid::Uuid;

use crate::scope::repository_error;

const KEPT_PER_CARD: i64 = 200;
const TEXT_MAX_CHARS: usize = 200;

pub(crate) struct Entry<'a> {
    kind: ActivityKind,
    subject: Option<Uuid>,
    from: Option<&'a str>,
    to: Option<&'a str>,
}

impl<'a> Entry<'a> {
    pub(crate) fn plain(kind: ActivityKind) -> Self {
        Self {
            kind,
            subject: None,
            from: None,
            to: None,
        }
    }

    pub(crate) fn between(kind: ActivityKind, from: &'a str, to: &'a str) -> Self {
        Self {
            from: Some(from),
            to: Some(to),
            ..Self::plain(kind)
        }
    }

    pub(crate) fn from(kind: ActivityKind, from: &'a str) -> Self {
        Self {
            from: Some(from),
            ..Self::plain(kind)
        }
    }

    pub(crate) fn naming(kind: ActivityKind, to: &'a str) -> Self {
        Self {
            to: Some(to),
            ..Self::plain(kind)
        }
    }

    pub(crate) fn about(kind: ActivityKind, subject: Uuid) -> Self {
        Self {
            subject: Some(subject),
            ..Self::plain(kind)
        }
    }
}

fn clip(text: &str) -> String {
    text.chars().take(TEXT_MAX_CHARS).collect()
}

pub(crate) async fn record(
    connection: &mut PgConnection,
    card_id: Uuid,
    actor: Uuid,
    entry: Entry<'_>,
) -> Result<(), BoardsError> {
    if entry.kind == ActivityKind::Described {
        let recent: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM card_activity WHERE card_id = $1 AND actor_id = $2 \
                AND kind = 'described' AND created_at > now() - interval '10 minutes')",
        )
        .bind(card_id)
        .bind(actor)
        .fetch_one(&mut *connection)
        .await
        .map_err(repository_error)?;
        if recent {
            return Ok(());
        }
    }

    sqlx::query(
        "INSERT INTO card_activity (card_id, actor_id, kind, subject_user_id, from_text, to_text) \
            VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(card_id)
    .bind(actor)
    .bind(entry.kind.as_str())
    .bind(entry.subject)
    .bind(entry.from.map(clip))
    .bind(entry.to.map(clip))
    .execute(&mut *connection)
    .await
    .map_err(repository_error)?;

    sqlx::query(
        "DELETE FROM card_activity WHERE card_id = $1 AND id NOT IN (\
            SELECT id FROM card_activity WHERE card_id = $1 \
            ORDER BY created_at DESC, id DESC LIMIT $2)",
    )
    .bind(card_id)
    .bind(KEPT_PER_CARD)
    .execute(&mut *connection)
    .await
    .map_err(repository_error)?;

    Ok(())
}
