use async_trait::async_trait;
use domain::boards::{BlockImage, BlockImageRepo, BoardsError};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::scope::{Kind, denial, repository_error};

pub struct PgBlockImageRepo {
    pool: PgPool,
}

impl PgBlockImageRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Whether the block is an image block the person may write to, or why not.
    async fn require_image_block(
        &self,
        connection: &mut sqlx::PgConnection,
        user_id: Uuid,
        block_id: Uuid,
    ) -> Result<(), BoardsError> {
        let Some(row) = sqlx::query(concat!(
            "SELECT l.kind FROM ",
            owned_list!(),
            " WHERE l.id = $1 AND ",
            writer_of!("$2"),
            " FOR UPDATE OF b"
        ))
        .bind(block_id)
        .bind(user_id)
        .fetch_optional(connection)
        .await
        .map_err(repository_error)?
        else {
            return Err(denial(&self.pool, Kind::List, user_id, block_id).await);
        };

        let kind: String = row.try_get("kind").map_err(repository_error)?;
        if kind != "image" {
            return Err(BoardsError::Invalid(
                "only an image block holds a picture".to_string(),
            ));
        }
        Ok(())
    }
}

#[async_trait]
impl BlockImageRepo for PgBlockImageRepo {
    async fn check_upload(&self, user_id: Uuid, block_id: Uuid) -> Result<(), BoardsError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;
        self.require_image_block(&mut transaction, user_id, block_id)
            .await?;
        transaction.commit().await.map_err(repository_error)?;
        Ok(())
    }

    async fn set(
        &self,
        user_id: Uuid,
        block_id: Uuid,
        image: BlockImage,
    ) -> Result<i64, BoardsError> {
        let width = i32::try_from(image.width)
            .map_err(|_| BoardsError::Invalid("that picture is too wide".to_string()))?;
        let height = i32::try_from(image.height)
            .map_err(|_| BoardsError::Invalid("that picture is too tall".to_string()))?;

        let mut transaction = self.pool.begin().await.map_err(repository_error)?;
        self.require_image_block(&mut transaction, user_id, block_id)
            .await?;

        // clock_timestamp, so two uploads in one transaction window still get different versions.
        let version: i64 = sqlx::query_scalar(
            "INSERT INTO block_images (block_id, content_type, width, height, bytes, updated_at) \
                VALUES ($1, $2, $3, $4, $5, clock_timestamp()) \
                ON CONFLICT (block_id) DO UPDATE SET content_type = EXCLUDED.content_type, \
                    width = EXCLUDED.width, height = EXCLUDED.height, bytes = EXCLUDED.bytes, \
                    updated_at = clock_timestamp() \
                RETURNING (extract(epoch FROM updated_at) * 1000000)::bigint",
        )
        .bind(block_id)
        .bind(&image.content_type)
        .bind(width)
        .bind(height)
        .bind(&image.bytes)
        .fetch_one(&mut *transaction)
        .await
        .map_err(repository_error)?;

        transaction.commit().await.map_err(repository_error)?;

        Ok(version)
    }

    async fn get(&self, user_id: Uuid, block_id: Uuid) -> Result<BlockImage, BoardsError> {
        let row = sqlx::query(concat!(
            "SELECT i.content_type, i.width, i.height, i.bytes FROM block_images i \
                JOIN lists l ON l.id = i.block_id JOIN boards b ON b.id = l.board_id \
                JOIN workspaces w ON w.id = b.workspace_id \
                WHERE i.block_id = $1 AND ",
            member_of!("$2")
        ))
        .bind(block_id)
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(repository_error)?
        .ok_or(BoardsError::NotFound)?;

        let width: i32 = row.try_get("width").map_err(repository_error)?;
        let height: i32 = row.try_get("height").map_err(repository_error)?;
        Ok(BlockImage {
            content_type: row.try_get("content_type").map_err(repository_error)?,
            width: u32::try_from(width).unwrap_or(0),
            height: u32::try_from(height).unwrap_or(0),
            bytes: row.try_get("bytes").map_err(repository_error)?,
        })
    }
}
