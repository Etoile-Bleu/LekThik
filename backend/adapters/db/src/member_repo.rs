use async_trait::async_trait;
use domain::boards::{BoardsError, Member, MemberRepo, Role};
use sqlx::postgres::PgRow;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::scope::repository_error;
use crate::workspace_repo::parse_role;

pub struct PgMemberRepo {
    pool: PgPool,
}

impl PgMemberRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

const MEMBER_COLUMNS: &str = "m.user_id, u.username, u.email, m.role, \
    to_char(m.joined_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS joined_at";

fn row_to_member(row: &PgRow) -> Result<Member, BoardsError> {
    let role: String = row.try_get("role").map_err(repository_error)?;

    Ok(Member {
        user_id: row.try_get("user_id").map_err(repository_error)?,
        username: row.try_get("username").map_err(repository_error)?,
        email: row.try_get("email").map_err(repository_error)?,
        role: parse_role(&role)?,
        joined_at: row.try_get("joined_at").map_err(repository_error)?,
    })
}

#[async_trait]
impl MemberRepo for PgMemberRepo {
    async fn role_of(
        &self,
        workspace_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<Role>, BoardsError> {
        let role: Option<String> = sqlx::query_scalar(
            "SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
        )
        .bind(workspace_id)
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(repository_error)?;

        role.map(|value| parse_role(&value)).transpose()
    }

    async fn list(&self, workspace_id: Uuid) -> Result<Vec<Member>, BoardsError> {
        let sql = format!(
            "SELECT {MEMBER_COLUMNS} FROM workspace_members m JOIN users u ON u.id = m.user_id \
             WHERE m.workspace_id = $1 ORDER BY \
             CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'writer' THEN 2 ELSE 3 END, \
             m.joined_at, m.user_id"
        );
        let rows = sqlx::query(sqlx::AssertSqlSafe(sql))
            .bind(workspace_id)
            .fetch_all(&self.pool)
            .await
            .map_err(repository_error)?;

        rows.iter().map(row_to_member).collect()
    }

    async fn set_role(
        &self,
        workspace_id: Uuid,
        user_id: Uuid,
        role: Role,
    ) -> Result<Member, BoardsError> {
        let updated = sqlx::query(
            "UPDATE workspace_members SET role = $3 \
             WHERE workspace_id = $1 AND user_id = $2 AND role <> 'owner'",
        )
        .bind(workspace_id)
        .bind(user_id)
        .bind(role.as_str())
        .execute(&self.pool)
        .await
        .map_err(repository_error)?;
        if updated.rows_affected() == 0 {
            return Err(BoardsError::NotFound);
        }

        let sql = format!(
            "SELECT {MEMBER_COLUMNS} FROM workspace_members m JOIN users u ON u.id = m.user_id \
             WHERE m.workspace_id = $1 AND m.user_id = $2"
        );
        let row = sqlx::query(sqlx::AssertSqlSafe(sql))
            .bind(workspace_id)
            .bind(user_id)
            .fetch_one(&self.pool)
            .await
            .map_err(repository_error)?;

        row_to_member(&row)
    }

    async fn remove(&self, workspace_id: Uuid, user_id: Uuid) -> Result<(), BoardsError> {
        let result = sqlx::query(
            "DELETE FROM workspace_members \
             WHERE workspace_id = $1 AND user_id = $2 AND role <> 'owner'",
        )
        .bind(workspace_id)
        .bind(user_id)
        .execute(&self.pool)
        .await
        .map_err(repository_error)?;

        if result.rows_affected() == 0 {
            return Err(BoardsError::NotFound);
        }

        Ok(())
    }

    async fn workspace_ids_of(&self, user_id: Uuid) -> Result<Vec<Uuid>, BoardsError> {
        sqlx::query_scalar("SELECT workspace_id FROM workspace_members WHERE user_id = $1")
            .bind(user_id)
            .fetch_all(&self.pool)
            .await
            .map_err(repository_error)
    }
}
