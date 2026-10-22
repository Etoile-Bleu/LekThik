use std::collections::HashMap;

use async_trait::async_trait;
use domain::boards::{
    BoardSummary, BoardTemplate, BoardsError, MAX_WORKSPACES_PER_USER, Title, Workspace,
    WorkspaceRepo, WorkspaceWithBoards,
};
use sqlx::postgres::PgRow;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::board_seed::insert_board;
use crate::scope::repository_error;

pub struct PgWorkspaceRepo {
    pool: PgPool,
}

impl PgWorkspaceRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

fn row_to_workspace(row: &PgRow) -> Result<Workspace, BoardsError> {
    Ok(Workspace {
        id: row.try_get("id").map_err(repository_error)?,
        name: row.try_get("name").map_err(repository_error)?,
    })
}

#[async_trait]
impl WorkspaceRepo for PgWorkspaceRepo {
    async fn create(
        &self,
        owner_id: Uuid,
        name: Title,
        boards: Vec<&'static BoardTemplate>,
    ) -> Result<WorkspaceWithBoards, BoardsError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;

        let owner = sqlx::query("SELECT id FROM users WHERE id = $1 FOR UPDATE")
            .bind(owner_id)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(repository_error)?;
        if owner.is_none() {
            return Err(BoardsError::NotFound);
        }

        let existing: i64 =
            sqlx::query_scalar("SELECT count(*) FROM workspaces WHERE owner_id = $1")
                .bind(owner_id)
                .fetch_one(&mut *transaction)
                .await
                .map_err(repository_error)?;
        if existing >= MAX_WORKSPACES_PER_USER {
            return Err(BoardsError::LimitReached("workspaces"));
        }

        let row = sqlx::query(
            "INSERT INTO workspaces (owner_id, name) VALUES ($1, $2) RETURNING id, name",
        )
        .bind(owner_id)
        .bind(name.as_str())
        .fetch_one(&mut *transaction)
        .await
        .map_err(repository_error)?;

        let workspace = row_to_workspace(&row)?;

        let mut created_boards = Vec::with_capacity(boards.len());
        for template in boards {
            let board = insert_board(
                &mut transaction,
                workspace.id,
                template.name,
                Some(template),
            )
            .await?;
            created_boards.push(BoardSummary {
                id: board.id,
                workspace_id: board.workspace_id,
                name: board.name,
            });
        }

        transaction.commit().await.map_err(repository_error)?;

        Ok(WorkspaceWithBoards {
            workspace,
            boards: created_boards,
        })
    }

    async fn list_with_boards(
        &self,
        owner_id: Uuid,
    ) -> Result<Vec<WorkspaceWithBoards>, BoardsError> {
        let workspace_rows = sqlx::query(
            "SELECT id, name FROM workspaces WHERE owner_id = $1 ORDER BY created_at, id",
        )
        .bind(owner_id)
        .fetch_all(&self.pool)
        .await
        .map_err(repository_error)?;

        let board_rows = sqlx::query(concat!(
            "SELECT b.id, b.workspace_id, b.name FROM ",
            owned_board!(),
            " WHERE w.owner_id = $1 ORDER BY b.created_at, b.id"
        ))
        .bind(owner_id)
        .fetch_all(&self.pool)
        .await
        .map_err(repository_error)?;

        let mut grouped = Vec::with_capacity(workspace_rows.len());
        let mut positions: HashMap<Uuid, usize> = HashMap::new();
        for row in &workspace_rows {
            let workspace = row_to_workspace(row)?;
            positions.insert(workspace.id, grouped.len());
            grouped.push(WorkspaceWithBoards {
                workspace,
                boards: Vec::new(),
            });
        }

        for row in &board_rows {
            let summary = BoardSummary {
                id: row.try_get("id").map_err(repository_error)?,
                workspace_id: row.try_get("workspace_id").map_err(repository_error)?,
                name: row.try_get("name").map_err(repository_error)?,
            };
            if let Some(index) = positions.get(&summary.workspace_id) {
                grouped[*index].boards.push(summary);
            }
        }

        Ok(grouped)
    }

    async fn rename(
        &self,
        owner_id: Uuid,
        id: Uuid,
        name: Title,
    ) -> Result<Workspace, BoardsError> {
        let row = sqlx::query(
            "UPDATE workspaces SET name = $3 WHERE id = $2 AND owner_id = $1 RETURNING id, name",
        )
        .bind(owner_id)
        .bind(id)
        .bind(name.as_str())
        .fetch_optional(&self.pool)
        .await
        .map_err(repository_error)?
        .ok_or(BoardsError::NotFound)?;

        row_to_workspace(&row)
    }

    async fn delete(&self, owner_id: Uuid, id: Uuid) -> Result<(), BoardsError> {
        let result = sqlx::query("DELETE FROM workspaces WHERE id = $2 AND owner_id = $1")
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
