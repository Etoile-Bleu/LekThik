use std::collections::HashMap;

use async_trait::async_trait;
use domain::boards::{
    BoardSummary, BoardTemplate, BoardsError, MAX_WORKSPACES_PER_USER, Role, Title, Workspace,
    WorkspaceRepo, WorkspaceWithBoards,
};
use sqlx::postgres::PgRow;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::board_seed::insert_board;
use crate::scope::{Kind, denial, repository_error};

pub struct PgWorkspaceRepo {
    pool: PgPool,
}

impl PgWorkspaceRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

pub(crate) fn parse_role(value: &str) -> Result<Role, BoardsError> {
    Role::parse(value)
        .ok_or_else(|| BoardsError::Repository(format!("unknown workspace role {value}")))
}

fn row_to_workspace(row: &PgRow) -> Result<Workspace, BoardsError> {
    let role: String = row.try_get("role").map_err(repository_error)?;

    Ok(Workspace {
        id: row.try_get("id").map_err(repository_error)?,
        name: row.try_get("name").map_err(repository_error)?,
        role: parse_role(&role)?,
    })
}

#[async_trait]
impl WorkspaceRepo for PgWorkspaceRepo {
    async fn create(
        &self,
        user_id: Uuid,
        name: Title,
        boards: Vec<&'static BoardTemplate>,
    ) -> Result<WorkspaceWithBoards, BoardsError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;

        let owner = sqlx::query("SELECT id FROM users WHERE id = $1 FOR UPDATE")
            .bind(user_id)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(repository_error)?;
        if owner.is_none() {
            return Err(BoardsError::NotFound);
        }

        let existing: i64 =
            sqlx::query_scalar("SELECT count(*) FROM workspaces WHERE owner_id = $1")
                .bind(user_id)
                .fetch_one(&mut *transaction)
                .await
                .map_err(repository_error)?;
        if existing >= MAX_WORKSPACES_PER_USER {
            return Err(BoardsError::LimitReached("workspaces"));
        }

        let row = sqlx::query(
            "INSERT INTO workspaces (owner_id, name) VALUES ($1, $2) \
                RETURNING id, name, 'owner' AS role",
        )
        .bind(user_id)
        .bind(name.as_str())
        .fetch_one(&mut *transaction)
        .await
        .map_err(repository_error)?;

        let workspace = row_to_workspace(&row)?;

        sqlx::query(
            "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')",
        )
        .bind(workspace.id)
        .bind(user_id)
        .execute(&mut *transaction)
        .await
        .map_err(repository_error)?;

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
        user_id: Uuid,
    ) -> Result<Vec<WorkspaceWithBoards>, BoardsError> {
        let workspace_rows = sqlx::query(
            "SELECT w.id, w.name, m.role FROM workspaces w \
                JOIN workspace_members m ON m.workspace_id = w.id \
                WHERE m.user_id = $1 ORDER BY w.created_at, w.id",
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await
        .map_err(repository_error)?;

        let board_rows = sqlx::query(concat!(
            "SELECT b.id, b.workspace_id, b.name FROM ",
            owned_board!(),
            " WHERE ",
            member_of!("$1"),
            " ORDER BY b.created_at, b.id"
        ))
        .bind(user_id)
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

    async fn rename(&self, user_id: Uuid, id: Uuid, name: Title) -> Result<Workspace, BoardsError> {
        let Some(row) = sqlx::query(concat!(
            "UPDATE workspaces w SET name = $3 WHERE w.id = $2 AND ",
            admin_of!("$1"),
            " RETURNING w.id, w.name, \
                (SELECT role FROM workspace_members WHERE workspace_id = w.id AND user_id = $1) AS role"
        ))
        .bind(user_id)
        .bind(id)
        .bind(name.as_str())
        .fetch_optional(&self.pool)
        .await
        .map_err(repository_error)?
        else {
            return Err(denial(&self.pool, Kind::Workspace, user_id, id).await);
        };

        row_to_workspace(&row)
    }

    async fn delete(&self, user_id: Uuid, id: Uuid) -> Result<(), BoardsError> {
        let result = sqlx::query("DELETE FROM workspaces WHERE id = $2 AND owner_id = $1")
            .bind(user_id)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(repository_error)?;

        if result.rows_affected() == 0 {
            return Err(denial(&self.pool, Kind::Workspace, user_id, id).await);
        }

        Ok(())
    }
}
