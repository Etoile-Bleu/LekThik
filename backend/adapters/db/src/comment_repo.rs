use async_trait::async_trait;
use domain::boards::{
    Activity, ActivityKind, BoardsError, Comment, CommentBody, CommentRepo, MAX_COMMENTS_PER_CARD,
    MAX_COMMENTS_PER_MINUTE, Person, TIMELINE_LIMIT, TimelineItem,
};
use sqlx::postgres::PgRow;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::scope::{Kind, denial, repository_error};

macro_rules! iso {
    ($column:literal) => {
        concat!(
            "to_char(",
            $column,
            " AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')"
        )
    };
}

macro_rules! micros {
    ($column:literal) => {
        concat!("(extract(epoch from ", $column, ") * 1000000)::bigint")
    };
}

pub struct PgCommentRepo {
    pool: PgPool,
}

impl PgCommentRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    async fn comment(&self, comment_id: Uuid) -> Result<Comment, BoardsError> {
        let row = sqlx::query(concat!(
            "SELECT cc.id, cc.card_id, cc.body, ",
            iso!("cc.created_at"),
            " AS created_at, ",
            iso!("cc.edited_at"),
            " AS edited_at, u.id AS author_id, u.username AS author_name \
                FROM card_comments cc LEFT JOIN users u ON u.id = cc.author_id \
                WHERE cc.id = $1"
        ))
        .bind(comment_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(repository_error)?
        .ok_or(BoardsError::NotFound)?;
        comment_from_row(&row)
    }

    async fn explain_missing(&self, user_id: Uuid, card_id: Uuid, comment_id: Uuid) -> BoardsError {
        let found = sqlx::query(concat!(
            "SELECT cc.author_id FROM card_comments cc JOIN cards c ON c.id = cc.card_id \
                JOIN lists l ON l.id = c.list_id JOIN boards b ON b.id = l.board_id \
                JOIN workspaces w ON w.id = b.workspace_id \
                WHERE cc.id = $1 AND cc.card_id = $2 AND ",
            member_of!("$3")
        ))
        .bind(comment_id)
        .bind(card_id)
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await;
        match found {
            Ok(Some(_)) => BoardsError::Forbidden,
            Ok(None) => BoardsError::NotFound,
            Err(error) => repository_error(error),
        }
    }
}

fn person(id: Option<Uuid>, name: Option<String>) -> Option<Person> {
    match (id, name) {
        (Some(id), Some(username)) => Some(Person { id, username }),
        _ => None,
    }
}

fn comment_from_row(row: &PgRow) -> Result<Comment, BoardsError> {
    Ok(Comment {
        id: row.try_get("id").map_err(repository_error)?,
        card_id: row.try_get("card_id").map_err(repository_error)?,
        author: person(
            row.try_get("author_id").map_err(repository_error)?,
            row.try_get("author_name").map_err(repository_error)?,
        ),
        body: row.try_get("body").map_err(repository_error)?,
        created_at: row.try_get("created_at").map_err(repository_error)?,
        edited_at: row.try_get("edited_at").map_err(repository_error)?,
    })
}

fn activity_from_row(row: &PgRow) -> Result<Activity, BoardsError> {
    let kind: String = row.try_get("kind").map_err(repository_error)?;
    Ok(Activity {
        id: row.try_get("id").map_err(repository_error)?,
        actor: person(
            row.try_get("actor_id").map_err(repository_error)?,
            row.try_get("actor_name").map_err(repository_error)?,
        ),
        kind: ActivityKind::parse(&kind)?,
        subject: person(
            row.try_get("subject_id").map_err(repository_error)?,
            row.try_get("subject_name").map_err(repository_error)?,
        ),
        from: row.try_get("from_text").map_err(repository_error)?,
        to: row.try_get("to_text").map_err(repository_error)?,
        created_at: row.try_get("created_at").map_err(repository_error)?,
    })
}

#[async_trait]
impl CommentRepo for PgCommentRepo {
    async fn timeline(
        &self,
        user_id: Uuid,
        card_id: Uuid,
    ) -> Result<Vec<TimelineItem>, BoardsError> {
        let visible = sqlx::query(concat!(
            "SELECT 1 FROM ",
            owned_card!(),
            " WHERE c.id = $1 AND ",
            member_of!("$2")
        ))
        .bind(card_id)
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(repository_error)?;
        if visible.is_none() {
            return Err(BoardsError::NotFound);
        }

        let comments = sqlx::query(concat!(
            "SELECT cc.id, cc.card_id, cc.body, ",
            iso!("cc.created_at"),
            " AS created_at, ",
            iso!("cc.edited_at"),
            " AS edited_at, ",
            micros!("cc.created_at"),
            " AS at_us, u.id AS author_id, u.username AS author_name \
                FROM card_comments cc LEFT JOIN users u ON u.id = cc.author_id \
                WHERE cc.card_id = $1 ORDER BY cc.created_at DESC, cc.id DESC LIMIT $2"
        ))
        .bind(card_id)
        .bind(TIMELINE_LIMIT)
        .fetch_all(&self.pool)
        .await
        .map_err(repository_error)?;

        let events = sqlx::query(concat!(
            "SELECT a.id, a.kind, a.from_text, a.to_text, ",
            iso!("a.created_at"),
            " AS created_at, ",
            micros!("a.created_at"),
            " AS at_us, actor.id AS actor_id, actor.username AS actor_name, \
                subject.id AS subject_id, subject.username AS subject_name \
                FROM card_activity a LEFT JOIN users actor ON actor.id = a.actor_id \
                LEFT JOIN users subject ON subject.id = a.subject_user_id \
                WHERE a.card_id = $1 ORDER BY a.created_at DESC, a.id DESC LIMIT $2"
        ))
        .bind(card_id)
        .bind(TIMELINE_LIMIT)
        .fetch_all(&self.pool)
        .await
        .map_err(repository_error)?;

        let mut merged: Vec<(i64, TimelineItem)> =
            Vec::with_capacity(comments.len() + events.len());
        for row in &comments {
            let at: i64 = row.try_get("at_us").map_err(repository_error)?;
            merged.push((at, TimelineItem::Comment(comment_from_row(row)?)));
        }
        for row in &events {
            let at: i64 = row.try_get("at_us").map_err(repository_error)?;
            merged.push((at, TimelineItem::Activity(activity_from_row(row)?)));
        }
        merged.sort_by_key(|(at, _)| *at);
        let skip = merged.len().saturating_sub(TIMELINE_LIMIT as usize);
        Ok(merged
            .into_iter()
            .skip(skip)
            .map(|(_, item)| item)
            .collect())
    }

    async fn add(
        &self,
        user_id: Uuid,
        card_id: Uuid,
        body: CommentBody,
    ) -> Result<Comment, BoardsError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;

        let locked = sqlx::query(concat!(
            "SELECT c.id FROM ",
            owned_card!(),
            " WHERE c.id = $1 AND ",
            writer_of!("$2"),
            " FOR UPDATE OF c"
        ))
        .bind(card_id)
        .bind(user_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(repository_error)?;
        if locked.is_none() {
            return Err(denial(&self.pool, Kind::Card, user_id, card_id).await);
        }

        let on_card: i64 =
            sqlx::query_scalar("SELECT count(*) FROM card_comments WHERE card_id = $1")
                .bind(card_id)
                .fetch_one(&mut *transaction)
                .await
                .map_err(repository_error)?;
        if on_card >= MAX_COMMENTS_PER_CARD {
            return Err(BoardsError::LimitReached("comments"));
        }

        let lately: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM card_comments WHERE author_id = $1 \
                AND created_at > now() - interval '1 minute'",
        )
        .bind(user_id)
        .fetch_one(&mut *transaction)
        .await
        .map_err(repository_error)?;
        if lately >= MAX_COMMENTS_PER_MINUTE {
            return Err(BoardsError::LimitReached("comments per minute"));
        }

        let comment_id: Uuid = sqlx::query_scalar(
            "INSERT INTO card_comments (card_id, author_id, body) VALUES ($1, $2, $3) RETURNING id",
        )
        .bind(card_id)
        .bind(user_id)
        .bind(body.as_str())
        .fetch_one(&mut *transaction)
        .await
        .map_err(repository_error)?;

        transaction.commit().await.map_err(repository_error)?;
        self.comment(comment_id).await
    }

    async fn edit(
        &self,
        user_id: Uuid,
        card_id: Uuid,
        comment_id: Uuid,
        body: CommentBody,
    ) -> Result<Comment, BoardsError> {
        let result = sqlx::query(concat!(
            "UPDATE card_comments cc SET body = $4, edited_at = now() \
                FROM cards c, lists l, boards b, workspaces w \
                WHERE cc.id = $2 AND cc.card_id = $1 AND cc.author_id = $3 AND c.id = cc.card_id \
                    AND l.id = c.list_id AND b.id = l.board_id AND w.id = b.workspace_id AND ",
            writer_of!("$3")
        ))
        .bind(card_id)
        .bind(comment_id)
        .bind(user_id)
        .bind(body.as_str())
        .execute(&self.pool)
        .await
        .map_err(repository_error)?;

        if result.rows_affected() == 0 {
            return Err(self.explain_missing(user_id, card_id, comment_id).await);
        }
        self.comment(comment_id).await
    }

    async fn delete(
        &self,
        user_id: Uuid,
        card_id: Uuid,
        comment_id: Uuid,
    ) -> Result<(), BoardsError> {
        let result = sqlx::query(concat!(
            "DELETE FROM card_comments cc USING cards c, lists l, boards b, workspaces w \
                WHERE cc.id = $2 AND cc.card_id = $1 AND c.id = cc.card_id \
                    AND l.id = c.list_id AND b.id = l.board_id AND w.id = b.workspace_id AND ",
            member_of!("$3"),
            " AND (cc.author_id = $3 OR ",
            admin_of!("$3"),
            ")"
        ))
        .bind(card_id)
        .bind(comment_id)
        .bind(user_id)
        .execute(&self.pool)
        .await
        .map_err(repository_error)?;

        if result.rows_affected() == 0 {
            return Err(self.explain_missing(user_id, card_id, comment_id).await);
        }
        Ok(())
    }
}
