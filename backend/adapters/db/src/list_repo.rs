use async_trait::async_trait;
use domain::boards::{BoardsError, List, ListRepo, MAX_LISTS_PER_BOARD, Title};
use sqlx::postgres::PgRow;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::ordering::{insert_at, renumber_lists};
use crate::scope::repository_error;

pub struct PgListRepo {
    pool: PgPool,
}

impl PgListRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

fn row_to_list(row: &PgRow) -> Result<List, BoardsError> {
    Ok(List {
        id: row.try_get("id").map_err(repository_error)?,
        board_id: row.try_get("board_id").map_err(repository_error)?,
        name: row.try_get("name").map_err(repository_error)?,
    })
}

#[async_trait]
impl ListRepo for PgListRepo {
    async fn create(
        &self,
        owner_id: Uuid,
        board_id: Uuid,
        name: Title,
    ) -> Result<List, BoardsError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;

        let board = sqlx::query(concat!(
            "SELECT b.id FROM ",
            owned_board!(),
            " WHERE b.id = $1 AND w.owner_id = $2 FOR UPDATE OF b"
        ))
        .bind(board_id)
        .bind(owner_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(repository_error)?;
        if board.is_none() {
            return Err(BoardsError::NotFound);
        }

        let existing: i64 = sqlx::query_scalar("SELECT count(*) FROM lists WHERE board_id = $1")
            .bind(board_id)
            .fetch_one(&mut *transaction)
            .await
            .map_err(repository_error)?;
        if existing >= MAX_LISTS_PER_BOARD {
            return Err(BoardsError::LimitReached("lists"));
        }

        let row = sqlx::query(
            "INSERT INTO lists (board_id, name, position) \
                VALUES ($1, $2, (SELECT COALESCE(MAX(position), -1) + 1 FROM lists WHERE board_id = $1)) \
                RETURNING id, board_id, name",
        )
        .bind(board_id)
        .bind(name.as_str())
        .fetch_one(&mut *transaction)
        .await
        .map_err(repository_error)?;

        transaction.commit().await.map_err(repository_error)?;

        row_to_list(&row)
    }

    async fn rename(&self, owner_id: Uuid, id: Uuid, name: Title) -> Result<List, BoardsError> {
        let row = sqlx::query(
            "UPDATE lists l SET name = $3 FROM boards b, workspaces w \
                WHERE l.id = $2 AND b.id = l.board_id AND w.id = b.workspace_id AND w.owner_id = $1 \
                RETURNING l.id, l.board_id, l.name",
        )
        .bind(owner_id)
        .bind(id)
        .bind(name.as_str())
        .fetch_optional(&self.pool)
        .await
        .map_err(repository_error)?
        .ok_or(BoardsError::NotFound)?;

        row_to_list(&row)
    }

    async fn move_to(&self, owner_id: Uuid, id: Uuid, index: usize) -> Result<(), BoardsError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;

        let board_id: Uuid = sqlx::query_scalar(concat!(
            "SELECT b.id FROM ",
            owned_list!(),
            " WHERE l.id = $1 AND w.owner_id = $2 FOR UPDATE OF b"
        ))
        .bind(id)
        .bind(owner_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(repository_error)?
        .ok_or(BoardsError::NotFound)?;

        let siblings: Vec<Uuid> = sqlx::query_scalar(
            "SELECT id FROM lists WHERE board_id = $1 AND id <> $2 ORDER BY position, created_at, id",
        )
        .bind(board_id)
        .bind(id)
        .fetch_all(&mut *transaction)
        .await
        .map_err(repository_error)?;

        let ordered = insert_at(siblings, id, index);
        renumber_lists(&mut transaction, &ordered).await?;

        transaction.commit().await.map_err(repository_error)?;

        Ok(())
    }

    async fn delete(&self, owner_id: Uuid, id: Uuid) -> Result<(), BoardsError> {
        let result = sqlx::query(
            "DELETE FROM lists l USING boards b, workspaces w \
                WHERE l.id = $2 AND b.id = l.board_id AND w.id = b.workspace_id AND w.owner_id = $1",
        )
        .bind(owner_id)
        .bind(id)
        .execute(&self.pool)
        .await
        .map_err(repository_error)?;

        if result.rows_affected() == 0 {
            return Err(BoardsError::NotFound);
        }

        Ok(())
    }
}
