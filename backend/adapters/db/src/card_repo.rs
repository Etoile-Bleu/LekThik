use async_trait::async_trait;
use domain::boards::{
    BoardsError, Card, CardRepo, CardSummary, CardUpdate, Description, MAX_CARDS_PER_LIST, Title,
};
use sqlx::postgres::PgRow;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::ordering::{insert_at, renumber_cards};
use crate::scope::{Kind, denial, repository_error};

pub struct PgCardRepo {
    pool: PgPool,
}

impl PgCardRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    async fn label_ids_of(&self, card_id: Uuid) -> Result<Vec<Uuid>, BoardsError> {
        sqlx::query_scalar("SELECT label_id FROM card_labels WHERE card_id = $1 ORDER BY label_id")
            .bind(card_id)
            .fetch_all(&self.pool)
            .await
            .map_err(repository_error)
    }

    async fn card_from_row(&self, row: &PgRow) -> Result<Card, BoardsError> {
        let id: Uuid = row.try_get("id").map_err(repository_error)?;

        Ok(Card {
            id,
            list_id: row.try_get("list_id").map_err(repository_error)?,
            title: row.try_get("title").map_err(repository_error)?,
            description: row.try_get("description").map_err(repository_error)?,
            label_ids: self.label_ids_of(id).await?,
        })
    }
}

#[async_trait]
impl CardRepo for PgCardRepo {
    async fn create(
        &self,
        user_id: Uuid,
        list_id: Uuid,
        title: Title,
    ) -> Result<CardSummary, BoardsError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;

        let locked = sqlx::query(concat!(
            "SELECT l.id FROM ",
            owned_list!(),
            " WHERE l.id = $1 AND ",
            writer_of!("$2"),
            " FOR UPDATE OF b"
        ))
        .bind(list_id)
        .bind(user_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(repository_error)?;
        if locked.is_none() {
            return Err(denial(&self.pool, Kind::List, user_id, list_id).await);
        }

        let existing: i64 = sqlx::query_scalar("SELECT count(*) FROM cards WHERE list_id = $1")
            .bind(list_id)
            .fetch_one(&mut *transaction)
            .await
            .map_err(repository_error)?;
        if existing >= MAX_CARDS_PER_LIST {
            return Err(BoardsError::LimitReached("cards"));
        }

        let row = sqlx::query(
            "INSERT INTO cards (list_id, title, position) \
                VALUES ($1, $2, (SELECT COALESCE(MAX(position), -1) + 1 FROM cards WHERE list_id = $1)) \
                RETURNING id, list_id, title",
        )
        .bind(list_id)
        .bind(title.as_str())
        .fetch_one(&mut *transaction)
        .await
        .map_err(repository_error)?;

        transaction.commit().await.map_err(repository_error)?;

        Ok(CardSummary {
            id: row.try_get("id").map_err(repository_error)?,
            list_id: row.try_get("list_id").map_err(repository_error)?,
            title: row.try_get("title").map_err(repository_error)?,
            has_description: false,
            label_ids: Vec::new(),
        })
    }

    async fn get(&self, user_id: Uuid, id: Uuid) -> Result<Card, BoardsError> {
        let row = sqlx::query(concat!(
            "SELECT c.id, c.list_id, c.title, c.description FROM ",
            owned_card!(),
            " WHERE c.id = $1 AND ",
            member_of!("$2")
        ))
        .bind(id)
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(repository_error)?
        .ok_or(BoardsError::NotFound)?;

        self.card_from_row(&row).await
    }

    async fn update(
        &self,
        user_id: Uuid,
        id: Uuid,
        update: CardUpdate,
    ) -> Result<Card, BoardsError> {
        let Some(row) = sqlx::query(concat!(
            "UPDATE cards c SET \
                title = COALESCE($3, c.title), \
                description = COALESCE($4, c.description), \
                updated_at = now() \
                FROM lists l, boards b, workspaces w \
                WHERE c.id = $2 AND l.id = c.list_id AND b.id = l.board_id \
                    AND w.id = b.workspace_id AND ",
            writer_of!("$1"),
            " RETURNING c.id, c.list_id, c.title, c.description"
        ))
        .bind(user_id)
        .bind(id)
        .bind(update.title.as_ref().map(Title::as_str))
        .bind(update.description.as_ref().map(Description::as_str))
        .fetch_optional(&self.pool)
        .await
        .map_err(repository_error)?
        else {
            return Err(denial(&self.pool, Kind::Card, user_id, id).await);
        };

        self.card_from_row(&row).await
    }

    async fn move_to(
        &self,
        user_id: Uuid,
        id: Uuid,
        list_id: Uuid,
        index: usize,
    ) -> Result<(), BoardsError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;

        let Some(source) = sqlx::query(concat!(
            "SELECT l.id AS list_id, b.id AS board_id FROM ",
            owned_card!(),
            " WHERE c.id = $1 AND ",
            writer_of!("$2"),
            " FOR UPDATE OF b"
        ))
        .bind(id)
        .bind(user_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(repository_error)?
        else {
            return Err(denial(&self.pool, Kind::Card, user_id, id).await);
        };
        let source_list_id: Uuid = source.try_get("list_id").map_err(repository_error)?;
        let board_id: Uuid = source.try_get("board_id").map_err(repository_error)?;

        let target = sqlx::query("SELECT id FROM lists WHERE id = $1 AND board_id = $2")
            .bind(list_id)
            .bind(board_id)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(repository_error)?;
        if target.is_none() {
            return Err(BoardsError::NotFound);
        }

        let siblings: Vec<Uuid> = sqlx::query_scalar(
            "SELECT id FROM cards WHERE list_id = $1 AND id <> $2 ORDER BY position, created_at, id",
        )
        .bind(list_id)
        .bind(id)
        .fetch_all(&mut *transaction)
        .await
        .map_err(repository_error)?;

        if source_list_id != list_id && siblings.len() as i64 >= MAX_CARDS_PER_LIST {
            return Err(BoardsError::LimitReached("cards"));
        }

        sqlx::query("UPDATE cards SET list_id = $1 WHERE id = $2")
            .bind(list_id)
            .bind(id)
            .execute(&mut *transaction)
            .await
            .map_err(repository_error)?;

        let ordered = insert_at(siblings, id, index);
        renumber_cards(&mut transaction, &ordered).await?;

        transaction.commit().await.map_err(repository_error)?;

        Ok(())
    }

    async fn delete(&self, user_id: Uuid, id: Uuid) -> Result<(), BoardsError> {
        let result = sqlx::query(concat!(
            "DELETE FROM cards c USING lists l, boards b, workspaces w \
                WHERE c.id = $2 AND l.id = c.list_id AND b.id = l.board_id \
                    AND w.id = b.workspace_id AND ",
            writer_of!("$1")
        ))
        .bind(user_id)
        .bind(id)
        .execute(&self.pool)
        .await
        .map_err(repository_error)?;

        if result.rows_affected() == 0 {
            return Err(denial(&self.pool, Kind::Card, user_id, id).await);
        }

        Ok(())
    }

    async fn set_labels(
        &self,
        user_id: Uuid,
        id: Uuid,
        label_ids: Vec<Uuid>,
    ) -> Result<Vec<Uuid>, BoardsError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;

        let Some(board_id) = sqlx::query_scalar::<_, Uuid>(concat!(
            "SELECT b.id FROM ",
            owned_card!(),
            " WHERE c.id = $1 AND ",
            writer_of!("$2"),
            " FOR UPDATE OF b"
        ))
        .bind(id)
        .bind(user_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(repository_error)?
        else {
            return Err(denial(&self.pool, Kind::Card, user_id, id).await);
        };

        if !label_ids.is_empty() {
            let found: i64 = sqlx::query_scalar(
                "SELECT count(*) FROM labels WHERE board_id = $1 AND id = ANY($2)",
            )
            .bind(board_id)
            .bind(&label_ids)
            .fetch_one(&mut *transaction)
            .await
            .map_err(repository_error)?;

            if found != label_ids.len() as i64 {
                return Err(BoardsError::Invalid(
                    "a label does not belong to this board".to_string(),
                ));
            }
        }

        sqlx::query("DELETE FROM card_labels WHERE card_id = $1")
            .bind(id)
            .execute(&mut *transaction)
            .await
            .map_err(repository_error)?;

        sqlx::query("INSERT INTO card_labels (card_id, label_id) SELECT $1, UNNEST($2::uuid[])")
            .bind(id)
            .bind(&label_ids)
            .execute(&mut *transaction)
            .await
            .map_err(repository_error)?;

        transaction.commit().await.map_err(repository_error)?;

        Ok(label_ids)
    }
}
