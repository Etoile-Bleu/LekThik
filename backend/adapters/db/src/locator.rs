use async_trait::async_trait;
use domain::boards::{BoardsError, Located, Locator, Target};
use sqlx::{PgPool, Row};

use crate::scope::repository_error;

pub struct PgLocator {
    pool: PgPool,
}

impl PgLocator {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl Locator for PgLocator {
    async fn locate(&self, target: Target) -> Result<Option<Located>, BoardsError> {
        let (sql, id) = match target {
            Target::Workspace(id) => (
                "SELECT w.id AS workspace_id, NULL::uuid AS board_id FROM workspaces w \
                 WHERE w.id = $1",
                id,
            ),
            Target::Board(id) => (
                concat!(
                    "SELECT w.id AS workspace_id, b.id AS board_id FROM ",
                    owned_board!(),
                    " WHERE b.id = $1"
                ),
                id,
            ),
            Target::List(id) => (
                concat!(
                    "SELECT w.id AS workspace_id, b.id AS board_id FROM ",
                    owned_list!(),
                    " WHERE l.id = $1"
                ),
                id,
            ),
            Target::Card(id) => (
                concat!(
                    "SELECT w.id AS workspace_id, b.id AS board_id FROM ",
                    owned_card!(),
                    " WHERE c.id = $1"
                ),
                id,
            ),
            Target::Label(id) => (
                concat!(
                    "SELECT w.id AS workspace_id, b.id AS board_id FROM ",
                    owned_label!(),
                    " WHERE lb.id = $1"
                ),
                id,
            ),
        };

        let row = sqlx::query(sql)
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(repository_error)?;

        row.map(|row| {
            Ok(Located {
                workspace_id: row.try_get("workspace_id").map_err(repository_error)?,
                board_id: row.try_get("board_id").map_err(repository_error)?,
            })
        })
        .transpose()
    }
}
