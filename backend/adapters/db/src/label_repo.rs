use async_trait::async_trait;
use domain::boards::{
    BoardsError, Label, LabelColor, LabelRepo, LabelUpdate, MAX_LABELS_PER_BOARD, Priority, Title,
};
use sqlx::postgres::PgRow;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::scope::{Kind, denial, repository_error};

pub struct PgLabelRepo {
    pool: PgPool,
}

impl PgLabelRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

pub(crate) fn row_to_label(row: &PgRow) -> Result<Label, BoardsError> {
    let color: String = row.try_get("color").map_err(repository_error)?;
    let level: i16 = row.try_get("priority").map_err(repository_error)?;

    Ok(Label {
        id: row.try_get("id").map_err(repository_error)?,
        board_id: row.try_get("board_id").map_err(repository_error)?,
        name: row.try_get("name").map_err(repository_error)?,
        color: LabelColor::parse(&color).map_err(|_| {
            BoardsError::Repository(format!("stored label color {color} is not in the palette"))
        })?,
        priority: Priority::from_level(level)?,
    })
}

#[async_trait]
impl LabelRepo for PgLabelRepo {
    async fn create(
        &self,
        user_id: Uuid,
        board_id: Uuid,
        name: Title,
        color: LabelColor,
        priority: Priority,
    ) -> Result<Label, BoardsError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;

        let board = sqlx::query(concat!(
            "SELECT b.id FROM ",
            owned_board!(),
            " WHERE b.id = $1 AND ",
            writer_of!("$2"),
            " FOR UPDATE OF b"
        ))
        .bind(board_id)
        .bind(user_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(repository_error)?;
        if board.is_none() {
            return Err(denial(&self.pool, Kind::Board, user_id, board_id).await);
        }

        let existing: i64 = sqlx::query_scalar("SELECT count(*) FROM labels WHERE board_id = $1")
            .bind(board_id)
            .fetch_one(&mut *transaction)
            .await
            .map_err(repository_error)?;
        if existing >= MAX_LABELS_PER_BOARD {
            return Err(BoardsError::LimitReached("labels"));
        }

        let row = sqlx::query(
            "INSERT INTO labels (board_id, name, color, priority) VALUES ($1, $2, $3, $4) \
                RETURNING id, board_id, name, color, priority",
        )
        .bind(board_id)
        .bind(name.as_str())
        .bind(color.as_str())
        .bind(priority.level())
        .fetch_one(&mut *transaction)
        .await
        .map_err(repository_error)?;

        transaction.commit().await.map_err(repository_error)?;

        row_to_label(&row)
    }

    async fn update(
        &self,
        user_id: Uuid,
        id: Uuid,
        update: LabelUpdate,
    ) -> Result<Label, BoardsError> {
        let Some(row) = sqlx::query(concat!(
            "UPDATE labels lb SET \
                name = COALESCE($3, lb.name), \
                color = COALESCE($4, lb.color), \
                priority = COALESCE($5, lb.priority) \
                FROM boards b, workspaces w \
                WHERE lb.id = $2 AND b.id = lb.board_id AND w.id = b.workspace_id AND ",
            writer_of!("$1"),
            " RETURNING lb.id, lb.board_id, lb.name, lb.color, lb.priority"
        ))
        .bind(user_id)
        .bind(id)
        .bind(update.name.as_ref().map(Title::as_str))
        .bind(update.color.map(LabelColor::as_str))
        .bind(update.priority.map(Priority::level))
        .fetch_optional(&self.pool)
        .await
        .map_err(repository_error)?
        else {
            return Err(denial(&self.pool, Kind::Label, user_id, id).await);
        };

        row_to_label(&row)
    }

    async fn delete(&self, user_id: Uuid, id: Uuid) -> Result<(), BoardsError> {
        let result = sqlx::query(concat!(
            "DELETE FROM labels lb USING boards b, workspaces w \
                WHERE lb.id = $2 AND b.id = lb.board_id AND w.id = b.workspace_id AND ",
            writer_of!("$1")
        ))
        .bind(user_id)
        .bind(id)
        .execute(&self.pool)
        .await
        .map_err(repository_error)?;

        if result.rows_affected() == 0 {
            return Err(denial(&self.pool, Kind::Label, user_id, id).await);
        }

        Ok(())
    }
}
