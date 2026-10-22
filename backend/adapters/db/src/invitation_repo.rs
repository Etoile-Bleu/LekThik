use async_trait::async_trait;
use domain::boards::{
    BoardsError, INVITATION_TTL_SECONDS, Invitation, InvitationRepo, InvitationStatus,
    MAX_MEMBERS_PER_WORKSPACE, MAX_PENDING_INVITATIONS_PER_WORKSPACE, NewInvitation,
};
use sqlx::postgres::PgRow;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::scope::repository_error;
use crate::workspace_repo::parse_role;

pub struct PgInvitationRepo {
    pool: PgPool,
}

impl PgInvitationRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

const INVITATION_SELECT: &str = "SELECT i.id, i.workspace_id, w.name AS workspace_name, i.email, \
    i.role, i.status, u.username AS invited_by, \
    to_char(i.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS created_at, \
    to_char(i.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS expires_at, \
    i.expires_at <= now() AS expired \
    FROM workspace_invitations i \
    JOIN workspaces w ON w.id = i.workspace_id \
    JOIN users u ON u.id = i.invited_by";

fn row_to_invitation(row: &PgRow) -> Result<Invitation, BoardsError> {
    let role: String = row.try_get("role").map_err(repository_error)?;
    let status: String = row.try_get("status").map_err(repository_error)?;

    Ok(Invitation {
        id: row.try_get("id").map_err(repository_error)?,
        workspace_id: row.try_get("workspace_id").map_err(repository_error)?,
        workspace_name: row.try_get("workspace_name").map_err(repository_error)?,
        email: row.try_get("email").map_err(repository_error)?,
        role: parse_role(&role)?,
        invited_by: row.try_get("invited_by").map_err(repository_error)?,
        status: InvitationStatus::parse(&status).ok_or_else(|| {
            BoardsError::Repository(format!("unknown invitation status {status}"))
        })?,
        created_at: row.try_get("created_at").map_err(repository_error)?,
        expires_at: row.try_get("expires_at").map_err(repository_error)?,
        expired: row.try_get("expired").map_err(repository_error)?,
    })
}

async fn fetch_one(pool: &PgPool, suffix: &str, id: Uuid) -> Result<Invitation, BoardsError> {
    let sql = format!("{INVITATION_SELECT} {suffix}");
    let row = sqlx::query(sqlx::AssertSqlSafe(sql))
        .bind(id)
        .fetch_one(pool)
        .await
        .map_err(repository_error)?;

    row_to_invitation(&row)
}

#[async_trait]
impl InvitationRepo for PgInvitationRepo {
    async fn create(&self, invitation: NewInvitation) -> Result<Invitation, BoardsError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;

        let locked = sqlx::query("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE")
            .bind(invitation.workspace_id)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(repository_error)?;
        if locked.is_none() {
            return Err(BoardsError::NotFound);
        }

        let already_member: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM workspace_members m JOIN users u ON u.id = m.user_id \
             WHERE m.workspace_id = $1 AND lower(u.email) = $2)",
        )
        .bind(invitation.workspace_id)
        .bind(&invitation.email)
        .fetch_one(&mut *transaction)
        .await
        .map_err(repository_error)?;
        if already_member {
            return Err(BoardsError::Conflict(
                "this person is already a member of the workspace".to_string(),
            ));
        }

        let members: i64 =
            sqlx::query_scalar("SELECT count(*) FROM workspace_members WHERE workspace_id = $1")
                .bind(invitation.workspace_id)
                .fetch_one(&mut *transaction)
                .await
                .map_err(repository_error)?;
        if members >= MAX_MEMBERS_PER_WORKSPACE {
            return Err(BoardsError::LimitReached("members"));
        }

        let pending: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM workspace_invitations \
             WHERE workspace_id = $1 AND status = 'pending' AND email <> $2",
        )
        .bind(invitation.workspace_id)
        .bind(&invitation.email)
        .fetch_one(&mut *transaction)
        .await
        .map_err(repository_error)?;
        if pending >= MAX_PENDING_INVITATIONS_PER_WORKSPACE {
            return Err(BoardsError::LimitReached("pending invitations"));
        }

        let id: Uuid = sqlx::query_scalar(
            "INSERT INTO workspace_invitations \
                (workspace_id, email, role, invited_by, expires_at) \
             VALUES ($1, $2, $3, $4, now() + make_interval(secs => $5)) \
             ON CONFLICT (workspace_id, email) WHERE status = 'pending' DO UPDATE SET \
                role = EXCLUDED.role, invited_by = EXCLUDED.invited_by, \
                created_at = now(), expires_at = EXCLUDED.expires_at \
             RETURNING id",
        )
        .bind(invitation.workspace_id)
        .bind(&invitation.email)
        .bind(invitation.role.as_str())
        .bind(invitation.invited_by)
        .bind(INVITATION_TTL_SECONDS as f64)
        .fetch_one(&mut *transaction)
        .await
        .map_err(repository_error)?;

        transaction.commit().await.map_err(repository_error)?;

        fetch_one(&self.pool, "WHERE i.id = $1", id).await
    }

    async fn find(&self, id: Uuid) -> Result<Option<Invitation>, BoardsError> {
        let sql = format!("{INVITATION_SELECT} WHERE i.id = $1");
        let row = sqlx::query(sqlx::AssertSqlSafe(sql))
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(repository_error)?;

        row.as_ref().map(row_to_invitation).transpose()
    }

    async fn list_pending_for_workspace(
        &self,
        workspace_id: Uuid,
    ) -> Result<Vec<Invitation>, BoardsError> {
        let sql = format!(
            "{INVITATION_SELECT} WHERE i.workspace_id = $1 AND i.status = 'pending' \
             ORDER BY i.created_at, i.id"
        );
        let rows = sqlx::query(sqlx::AssertSqlSafe(sql))
            .bind(workspace_id)
            .fetch_all(&self.pool)
            .await
            .map_err(repository_error)?;

        rows.iter().map(row_to_invitation).collect()
    }

    async fn list_pending_for_email(&self, email: &str) -> Result<Vec<Invitation>, BoardsError> {
        let sql = format!(
            "{INVITATION_SELECT} WHERE i.email = $1 AND i.status = 'pending' \
             AND i.expires_at > now() ORDER BY i.created_at DESC, i.id"
        );
        let rows = sqlx::query(sqlx::AssertSqlSafe(sql))
            .bind(email)
            .fetch_all(&self.pool)
            .await
            .map_err(repository_error)?;

        rows.iter().map(row_to_invitation).collect()
    }

    async fn revoke(&self, workspace_id: Uuid, id: Uuid) -> Result<(), BoardsError> {
        let result = sqlx::query(
            "UPDATE workspace_invitations SET status = 'revoked', responded_at = now() \
             WHERE id = $2 AND workspace_id = $1 AND status = 'pending'",
        )
        .bind(workspace_id)
        .bind(id)
        .execute(&self.pool)
        .await
        .map_err(repository_error)?;

        if result.rows_affected() == 0 {
            return Err(BoardsError::NotFound);
        }

        Ok(())
    }

    async fn accept(&self, id: Uuid, user_id: Uuid) -> Result<Invitation, BoardsError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;

        let claimed = sqlx::query(
            "UPDATE workspace_invitations SET status = 'accepted', responded_at = now() \
             WHERE id = $1 AND status = 'pending' AND expires_at > now() \
             RETURNING workspace_id, role",
        )
        .bind(id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(repository_error)?
        .ok_or_else(|| BoardsError::Conflict("this invitation is no longer valid".to_string()))?;
        let workspace_id: Uuid = claimed.try_get("workspace_id").map_err(repository_error)?;
        let role: String = claimed.try_get("role").map_err(repository_error)?;

        sqlx::query("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE")
            .bind(workspace_id)
            .fetch_one(&mut *transaction)
            .await
            .map_err(repository_error)?;

        let members: i64 =
            sqlx::query_scalar("SELECT count(*) FROM workspace_members WHERE workspace_id = $1")
                .bind(workspace_id)
                .fetch_one(&mut *transaction)
                .await
                .map_err(repository_error)?;
        if members >= MAX_MEMBERS_PER_WORKSPACE {
            return Err(BoardsError::LimitReached("members"));
        }

        sqlx::query(
            "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3) \
             ON CONFLICT (workspace_id, user_id) DO NOTHING",
        )
        .bind(workspace_id)
        .bind(user_id)
        .bind(&role)
        .execute(&mut *transaction)
        .await
        .map_err(repository_error)?;

        transaction.commit().await.map_err(repository_error)?;

        fetch_one(&self.pool, "WHERE i.id = $1", id).await
    }

    async fn decline(&self, id: Uuid) -> Result<Invitation, BoardsError> {
        let result = sqlx::query(
            "UPDATE workspace_invitations SET status = 'declined', responded_at = now() \
             WHERE id = $1 AND status = 'pending' AND expires_at > now()",
        )
        .bind(id)
        .execute(&self.pool)
        .await
        .map_err(repository_error)?;
        if result.rows_affected() == 0 {
            return Err(BoardsError::Conflict(
                "this invitation is no longer valid".to_string(),
            ));
        }

        fetch_one(&self.pool, "WHERE i.id = $1", id).await
    }
}
