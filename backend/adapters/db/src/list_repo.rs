use async_trait::async_trait;
use domain::boards::{
    BlockConfig, BoardsError, List, ListKind, ListRepo, MAX_LISTS_PER_BOARD, Title, WipLimit,
};
use sqlx::postgres::PgRow;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::ordering::{insert_at, renumber_lists};
use crate::scope::{Kind, denial, repository_error};

pub struct PgListRepo {
    pool: PgPool,
}

impl PgListRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

/// Reads the `kind` and `config` columns (selected as `config::text`) back into a checked config.
pub(crate) fn row_to_config(row: &PgRow) -> Result<BlockConfig, BoardsError> {
    let kind: String = row.try_get("kind").map_err(repository_error)?;
    let text: String = row.try_get("config").map_err(repository_error)?;
    let value: serde_json::Value = serde_json::from_str(&text)
        .map_err(|error| BoardsError::Repository(format!("stored block settings: {error}")))?;
    BlockConfig::parse(ListKind::parse(&kind)?, value)
}

/// A counter measures progress against one list of its own board, which must still be a list.
async fn check_done_list(
    connection: &mut sqlx::PgConnection,
    board_id: Uuid,
    config: &BlockConfig,
) -> Result<(), BoardsError> {
    let Some(list_id) = config.done_list() else {
        return Ok(());
    };
    let found =
        sqlx::query("SELECT 1 FROM lists WHERE id = $1 AND board_id = $2 AND kind = 'list'")
            .bind(list_id)
            .bind(board_id)
            .fetch_optional(connection)
            .await
            .map_err(repository_error)?;
    if found.is_none() {
        return Err(BoardsError::Invalid(
            "the done list must be a list of this board".to_string(),
        ));
    }
    Ok(())
}

fn row_to_list(row: &PgRow) -> Result<List, BoardsError> {
    Ok(List {
        id: row.try_get("id").map_err(repository_error)?,
        board_id: row.try_get("board_id").map_err(repository_error)?,
        name: row.try_get("name").map_err(repository_error)?,
        wip_limit: row
            .try_get::<Option<i16>, _>("wip_limit")
            .map_err(repository_error)?
            .and_then(|limit| u8::try_from(limit).ok()),
        config: row_to_config(row)?,
    })
}

#[async_trait]
impl ListRepo for PgListRepo {
    async fn create(
        &self,
        user_id: Uuid,
        board_id: Uuid,
        name: Title,
    ) -> Result<List, BoardsError> {
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
                RETURNING id, board_id, name, wip_limit, kind, config::text AS config",
        )
        .bind(board_id)
        .bind(name.as_str())
        .fetch_one(&mut *transaction)
        .await
        .map_err(repository_error)?;

        transaction.commit().await.map_err(repository_error)?;

        row_to_list(&row)
    }

    async fn rename(&self, user_id: Uuid, id: Uuid, name: Title) -> Result<List, BoardsError> {
        let Some(row) = sqlx::query(concat!(
            "UPDATE lists l SET name = $3 FROM boards b, workspaces w \
                WHERE l.id = $2 AND b.id = l.board_id AND w.id = b.workspace_id AND ",
            writer_of!("$1"),
            " RETURNING l.id, l.board_id, l.name, l.wip_limit, l.kind, l.config::text AS config"
        ))
        .bind(user_id)
        .bind(id)
        .bind(name.as_str())
        .fetch_optional(&self.pool)
        .await
        .map_err(repository_error)?
        else {
            return Err(denial(&self.pool, Kind::List, user_id, id).await);
        };

        row_to_list(&row)
    }

    async fn create_block(
        &self,
        user_id: Uuid,
        board_id: Uuid,
        name: Title,
        config: BlockConfig,
    ) -> Result<List, BoardsError> {
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

        let existing: i64 = sqlx::query_scalar("SELECT count(*) FROM lists WHERE board_id = $1")
            .bind(board_id)
            .fetch_one(&mut *transaction)
            .await
            .map_err(repository_error)?;
        if existing >= MAX_LISTS_PER_BOARD {
            return Err(BoardsError::LimitReached("lists"));
        }

        check_done_list(&mut transaction, board_id, &config).await?;

        let row = sqlx::query(
            "INSERT INTO lists (board_id, name, position, kind, config) \
                VALUES ($1, $2, (SELECT COALESCE(MAX(position), -1) + 1 FROM lists WHERE board_id = $1), \
                    $3, $4::jsonb) \
                RETURNING id, board_id, name, wip_limit, kind, config::text AS config",
        )
        .bind(board_id)
        .bind(name.as_str())
        .bind(config.kind().as_str())
        .bind(config.to_value().to_string())
        .fetch_one(&mut *transaction)
        .await
        .map_err(repository_error)?;

        transaction.commit().await.map_err(repository_error)?;

        row_to_list(&row)
    }

    async fn set_config(
        &self,
        user_id: Uuid,
        id: Uuid,
        config: BlockConfig,
    ) -> Result<List, BoardsError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;

        let Some(current) = sqlx::query(concat!(
            "SELECT l.kind, b.id AS board_id FROM ",
            owned_list!(),
            " WHERE l.id = $1 AND ",
            writer_of!("$2"),
            " FOR UPDATE OF b"
        ))
        .bind(id)
        .bind(user_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(repository_error)?
        else {
            return Err(denial(&self.pool, Kind::List, user_id, id).await);
        };
        let kind: String = current.try_get("kind").map_err(repository_error)?;
        let board_id: Uuid = current.try_get("board_id").map_err(repository_error)?;
        if kind != config.kind().as_str() {
            return Err(BoardsError::Invalid(
                "a block keeps the kind it was made with".to_string(),
            ));
        }

        check_done_list(&mut transaction, board_id, &config).await?;

        let row = sqlx::query(
            "UPDATE lists SET config = $2::jsonb WHERE id = $1 \
                RETURNING id, board_id, name, wip_limit, kind, config::text AS config",
        )
        .bind(id)
        .bind(config.to_value().to_string())
        .fetch_one(&mut *transaction)
        .await
        .map_err(repository_error)?;

        transaction.commit().await.map_err(repository_error)?;

        row_to_list(&row)
    }

    async fn set_wip_limit(
        &self,
        user_id: Uuid,
        id: Uuid,
        limit: Option<WipLimit>,
    ) -> Result<List, BoardsError> {
        let Some(row) = sqlx::query(concat!(
            "UPDATE lists l SET wip_limit = $3 FROM boards b, workspaces w \
                WHERE l.id = $2 AND b.id = l.board_id AND w.id = b.workspace_id AND ",
            writer_of!("$1"),
            " RETURNING l.id, l.board_id, l.name, l.wip_limit, l.kind, l.config::text AS config"
        ))
        .bind(user_id)
        .bind(id)
        .bind(limit.map(|limit| i16::from(limit.get())))
        .fetch_optional(&self.pool)
        .await
        .map_err(repository_error)?
        else {
            return Err(denial(&self.pool, Kind::List, user_id, id).await);
        };

        row_to_list(&row)
    }

    async fn move_to(&self, user_id: Uuid, id: Uuid, index: usize) -> Result<(), BoardsError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;

        let Some(board_id) = sqlx::query_scalar::<_, Uuid>(concat!(
            "SELECT b.id FROM ",
            owned_list!(),
            " WHERE l.id = $1 AND ",
            writer_of!("$2"),
            " FOR UPDATE OF b"
        ))
        .bind(id)
        .bind(user_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(repository_error)?
        else {
            return Err(denial(&self.pool, Kind::List, user_id, id).await);
        };

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

    async fn delete(&self, user_id: Uuid, id: Uuid) -> Result<(), BoardsError> {
        let result = sqlx::query(concat!(
            "DELETE FROM lists l USING boards b, workspaces w \
                WHERE l.id = $2 AND b.id = l.board_id AND w.id = b.workspace_id AND ",
            writer_of!("$1")
        ))
        .bind(user_id)
        .bind(id)
        .execute(&self.pool)
        .await
        .map_err(repository_error)?;

        if result.rows_affected() == 0 {
            return Err(denial(&self.pool, Kind::List, user_id, id).await);
        }

        Ok(())
    }
}
