use async_trait::async_trait;
use domain::{
    AccountError, AccountExport, AccountRepo, ExportAssignment, ExportComment, ExportMembership,
    ExportProfile, ExportVote, OwnedWorkspace,
};
use sqlx::{PgPool, Row};
use uuid::Uuid;

pub struct PgAccountRepo {
    pool: PgPool,
}

impl PgAccountRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

fn failure(error: impl std::fmt::Display) -> AccountError {
    AccountError::Repository(error.to_string())
}

#[async_trait]
impl AccountRepo for PgAccountRepo {
    async fn export(&self, user_id: Uuid) -> Result<AccountExport, AccountError> {
        let mut transaction = self.pool.begin().await.map_err(failure)?;

        let Some(profile) = sqlx::query(
            "SELECT id, email, username, email_verified_at IS NOT NULL AS verified, \
                created_at::text AS created_at, now()::text AS generated_at \
                FROM users WHERE id = $1",
        )
        .bind(user_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(failure)?
        else {
            return Err(AccountError::NotFound);
        };

        let preferences: Option<String> =
            sqlx::query_scalar("SELECT data::text FROM user_preferences WHERE user_id = $1")
                .bind(user_id)
                .fetch_optional(&mut *transaction)
                .await
                .map_err(failure)?;

        let memberships = sqlx::query(
            "SELECT w.name, m.role, m.joined_at::text AS joined_at \
                FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id \
                WHERE m.user_id = $1 ORDER BY m.joined_at, w.id",
        )
        .bind(user_id)
        .fetch_all(&mut *transaction)
        .await
        .map_err(failure)?;

        let assignments = sqlx::query(
            "SELECT w.name AS workspace, b.name AS board, c.title AS card, \
                a.assigned_at::text AS assigned_at \
                FROM card_assignees a JOIN cards c ON c.id = a.card_id \
                JOIN lists l ON l.id = c.list_id JOIN boards b ON b.id = l.board_id \
                JOIN workspaces w ON w.id = b.workspace_id \
                WHERE a.user_id = $1 ORDER BY a.assigned_at, c.id",
        )
        .bind(user_id)
        .fetch_all(&mut *transaction)
        .await
        .map_err(failure)?;

        let comments = sqlx::query(
            "SELECT w.name AS workspace, b.name AS board, c.title AS card, cm.body, \
                cm.created_at::text AS created_at, cm.edited_at::text AS edited_at \
                FROM card_comments cm JOIN cards c ON c.id = cm.card_id \
                JOIN lists l ON l.id = c.list_id JOIN boards b ON b.id = l.board_id \
                JOIN workspaces w ON w.id = b.workspace_id \
                WHERE cm.author_id = $1 ORDER BY cm.created_at, cm.id",
        )
        .bind(user_id)
        .fetch_all(&mut *transaction)
        .await
        .map_err(failure)?;

        let votes = sqlx::query(
            "SELECT w.name AS workspace, b.name AS board, l.config->>'question' AS question, \
                (SELECT o->>'text' FROM jsonb_array_elements(l.config->'options') o \
                    WHERE o->>'id' = v.option_id LIMIT 1) AS option, \
                v.voted_at::text AS voted_at \
                FROM poll_votes v JOIN lists l ON l.id = v.list_id \
                JOIN boards b ON b.id = l.board_id JOIN workspaces w ON w.id = b.workspace_id \
                WHERE v.user_id = $1 ORDER BY v.voted_at, l.id",
        )
        .bind(user_id)
        .fetch_all(&mut *transaction)
        .await
        .map_err(failure)?;

        transaction.commit().await.map_err(failure)?;

        Ok(AccountExport {
            generated_at: profile.try_get("generated_at").map_err(failure)?,
            profile: ExportProfile {
                id: profile.try_get("id").map_err(failure)?,
                email: profile.try_get("email").map_err(failure)?,
                username: profile.try_get("username").map_err(failure)?,
                email_verified: profile.try_get("verified").map_err(failure)?,
                created_at: profile.try_get("created_at").map_err(failure)?,
            },
            preferences: preferences
                .map(|text| serde_json::from_str(&text))
                .transpose()
                .map_err(failure)?,
            memberships: memberships
                .iter()
                .map(|row| {
                    Ok(ExportMembership {
                        workspace: row.try_get("name").map_err(failure)?,
                        role: row.try_get("role").map_err(failure)?,
                        joined_at: row.try_get("joined_at").map_err(failure)?,
                    })
                })
                .collect::<Result<_, AccountError>>()?,
            assigned_cards: assignments
                .iter()
                .map(|row| {
                    Ok(ExportAssignment {
                        workspace: row.try_get("workspace").map_err(failure)?,
                        board: row.try_get("board").map_err(failure)?,
                        card: row.try_get("card").map_err(failure)?,
                        assigned_at: row.try_get("assigned_at").map_err(failure)?,
                    })
                })
                .collect::<Result<_, AccountError>>()?,
            comments: comments
                .iter()
                .map(|row| {
                    Ok(ExportComment {
                        workspace: row.try_get("workspace").map_err(failure)?,
                        board: row.try_get("board").map_err(failure)?,
                        card: row.try_get("card").map_err(failure)?,
                        body: row.try_get("body").map_err(failure)?,
                        created_at: row.try_get("created_at").map_err(failure)?,
                        edited_at: row.try_get("edited_at").map_err(failure)?,
                    })
                })
                .collect::<Result<_, AccountError>>()?,
            poll_votes: votes
                .iter()
                .map(|row| {
                    Ok(ExportVote {
                        workspace: row.try_get("workspace").map_err(failure)?,
                        board: row.try_get("board").map_err(failure)?,
                        question: row
                            .try_get::<Option<String>, _>("question")
                            .map_err(failure)?
                            .unwrap_or_default(),
                        option: row.try_get("option").map_err(failure)?,
                        voted_at: row.try_get("voted_at").map_err(failure)?,
                    })
                })
                .collect::<Result<_, AccountError>>()?,
        })
    }

    async fn delete(
        &self,
        user_id: Uuid,
        delete_owned_workspaces: bool,
    ) -> Result<(), AccountError> {
        let mut transaction = self.pool.begin().await.map_err(failure)?;

        let locked = sqlx::query("SELECT id FROM users WHERE id = $1 FOR UPDATE")
            .bind(user_id)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(failure)?;
        if locked.is_none() {
            return Err(AccountError::NotFound);
        }

        let owned = sqlx::query(
            "SELECT w.id, w.name, \
                (SELECT count(*) FROM workspace_members o \
                    WHERE o.workspace_id = w.id AND o.user_id <> $1) AS others \
                FROM workspaces w JOIN workspace_members m \
                    ON m.workspace_id = w.id AND m.user_id = $1 AND m.role = 'owner' \
                ORDER BY w.created_at, w.id FOR UPDATE OF w",
        )
        .bind(user_id)
        .fetch_all(&mut *transaction)
        .await
        .map_err(failure)?;

        let mut shared = Vec::new();
        let mut owned_ids = Vec::with_capacity(owned.len());
        for row in &owned {
            let id: Uuid = row.try_get("id").map_err(failure)?;
            let others: i64 = row.try_get("others").map_err(failure)?;
            owned_ids.push(id);
            if others > 0 {
                shared.push(OwnedWorkspace {
                    id,
                    name: row.try_get("name").map_err(failure)?,
                    other_members: others,
                });
            }
        }
        if !shared.is_empty() && !delete_owned_workspaces {
            return Err(AccountError::Blocked(shared));
        }

        sqlx::query("DELETE FROM workspaces WHERE id = ANY($1)")
            .bind(&owned_ids)
            .execute(&mut *transaction)
            .await
            .map_err(failure)?;
        sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(user_id)
            .execute(&mut *transaction)
            .await
            .map_err(failure)?;

        transaction.commit().await.map_err(failure)
    }
}
