use std::collections::HashMap;

use async_trait::async_trait;
use domain::boards::{
    Board, BoardAccent, BoardBackground, BoardLook, BoardMember, BoardRepo, BoardTemplate,
    BoardView, BoardsError, CardSummary, ListWithCards, MAX_BOARDS_PER_WORKSPACE, Role, Title,
};
use sqlx::postgres::PgRow;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::board_seed::insert_board;
use crate::label_repo::row_to_label;
use crate::scope::{Kind, denial, repository_error};

pub struct PgBoardRepo {
    pool: PgPool,
}

impl PgBoardRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

fn row_to_board(row: &PgRow) -> Result<Board, BoardsError> {
    Ok(Board {
        id: row.try_get("id").map_err(repository_error)?,
        workspace_id: row.try_get("workspace_id").map_err(repository_error)?,
        name: row.try_get("name").map_err(repository_error)?,
    })
}

fn row_to_look(row: &PgRow) -> Result<BoardLook, BoardsError> {
    let background: String = row.try_get("background").map_err(repository_error)?;
    let accent: String = row.try_get("accent").map_err(repository_error)?;

    Ok(BoardLook {
        background: BoardBackground::parse(&background).ok_or_else(|| {
            BoardsError::Repository(format!("unknown board background {background}"))
        })?,
        accent: BoardAccent::parse(&accent)
            .ok_or_else(|| BoardsError::Repository(format!("unknown board accent {accent}")))?,
    })
}

#[async_trait]
impl BoardRepo for PgBoardRepo {
    async fn create(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        name: Title,
        template: Option<&'static BoardTemplate>,
    ) -> Result<Board, BoardsError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;

        let workspace = sqlx::query(concat!(
            "SELECT w.id FROM workspaces w WHERE w.id = $1 AND ",
            writer_of!("$2"),
            " FOR UPDATE OF w"
        ))
        .bind(workspace_id)
        .bind(user_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(repository_error)?;
        if workspace.is_none() {
            return Err(denial(&self.pool, Kind::Workspace, user_id, workspace_id).await);
        }

        let existing: i64 =
            sqlx::query_scalar("SELECT count(*) FROM boards WHERE workspace_id = $1")
                .bind(workspace_id)
                .fetch_one(&mut *transaction)
                .await
                .map_err(repository_error)?;
        if existing >= MAX_BOARDS_PER_WORKSPACE {
            return Err(BoardsError::LimitReached("boards"));
        }

        let board = insert_board(&mut transaction, workspace_id, name.as_str(), template).await?;

        transaction.commit().await.map_err(repository_error)?;

        Ok(board)
    }

    async fn get_view(&self, user_id: Uuid, id: Uuid) -> Result<BoardView, BoardsError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;
        sqlx::query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            .execute(&mut *transaction)
            .await
            .map_err(repository_error)?;

        let board_row = sqlx::query(concat!(
            "SELECT b.id, b.workspace_id, b.name, b.background, b.accent FROM ",
            owned_board!(),
            " WHERE b.id = $1 AND ",
            member_of!("$2")
        ))
        .bind(id)
        .bind(user_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(repository_error)?
        .ok_or(BoardsError::NotFound)?;
        let board = row_to_board(&board_row)?;
        let look = row_to_look(&board_row)?;

        let role_name: String = sqlx::query_scalar(
            "SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
        )
        .bind(board.workspace_id)
        .bind(user_id)
        .fetch_one(&mut *transaction)
        .await
        .map_err(repository_error)?;
        let role = Role::parse(&role_name).ok_or_else(|| {
            BoardsError::Repository(format!("unknown workspace role {role_name}"))
        })?;

        let list_rows = sqlx::query(
            "SELECT id, name, wip_limit, kind, config::text AS config, \
                (SELECT (extract(epoch FROM i.updated_at) * 1000000)::bigint \
                    FROM block_images i WHERE i.block_id = lists.id) AS image_version \
                FROM lists WHERE board_id = $1 ORDER BY position, created_at, id",
        )
        .bind(board.id)
        .fetch_all(&mut *transaction)
        .await
        .map_err(repository_error)?;

        let card_rows = sqlx::query(
            "SELECT c.id, c.list_id, c.title, c.description <> '' AS has_description, \
                c.due_date::text AS due_date, left(c.description, 140) AS preview \
                FROM cards c JOIN lists l ON l.id = c.list_id \
                WHERE l.board_id = $1 ORDER BY c.position, c.created_at, c.id",
        )
        .bind(board.id)
        .fetch_all(&mut *transaction)
        .await
        .map_err(repository_error)?;

        let card_label_rows = sqlx::query(
            "SELECT cl.card_id, cl.label_id FROM card_labels cl \
                JOIN cards c ON c.id = cl.card_id JOIN lists l ON l.id = c.list_id \
                WHERE l.board_id = $1 ORDER BY cl.label_id",
        )
        .bind(board.id)
        .fetch_all(&mut *transaction)
        .await
        .map_err(repository_error)?;

        let assignee_rows = sqlx::query(
            "SELECT ca.card_id, ca.user_id FROM card_assignees ca \
                JOIN cards c ON c.id = ca.card_id JOIN lists l ON l.id = c.list_id \
                WHERE l.board_id = $1 ORDER BY ca.assigned_at, ca.user_id",
        )
        .bind(board.id)
        .fetch_all(&mut *transaction)
        .await
        .map_err(repository_error)?;

        let member_rows = sqlx::query(
            "SELECT m.user_id, u.username FROM workspace_members m \
                JOIN users u ON u.id = m.user_id WHERE m.workspace_id = $1 \
                ORDER BY lower(u.username), m.user_id",
        )
        .bind(board.workspace_id)
        .fetch_all(&mut *transaction)
        .await
        .map_err(repository_error)?;

        let label_rows = sqlx::query(
            "SELECT id, board_id, name, color, priority FROM labels \
                WHERE board_id = $1 ORDER BY priority DESC, created_at, id",
        )
        .bind(board.id)
        .fetch_all(&mut *transaction)
        .await
        .map_err(repository_error)?;

        transaction.commit().await.map_err(repository_error)?;

        let mut labels_by_card: HashMap<Uuid, Vec<Uuid>> = HashMap::new();
        for row in &card_label_rows {
            let card_id: Uuid = row.try_get("card_id").map_err(repository_error)?;
            let label_id: Uuid = row.try_get("label_id").map_err(repository_error)?;
            labels_by_card.entry(card_id).or_default().push(label_id);
        }

        let mut assignees_by_card: HashMap<Uuid, Vec<Uuid>> = HashMap::new();
        for row in &assignee_rows {
            let card_id: Uuid = row.try_get("card_id").map_err(repository_error)?;
            let assignee: Uuid = row.try_get("user_id").map_err(repository_error)?;
            assignees_by_card.entry(card_id).or_default().push(assignee);
        }

        let members = member_rows
            .iter()
            .map(|row| {
                Ok(BoardMember {
                    user_id: row.try_get("user_id").map_err(repository_error)?,
                    username: row.try_get("username").map_err(repository_error)?,
                })
            })
            .collect::<Result<Vec<_>, BoardsError>>()?;

        let mut lists = Vec::with_capacity(list_rows.len());
        let mut list_positions: HashMap<Uuid, usize> = HashMap::new();
        for row in &list_rows {
            let list_id: Uuid = row.try_get("id").map_err(repository_error)?;
            list_positions.insert(list_id, lists.len());
            lists.push(ListWithCards {
                id: list_id,
                name: row.try_get("name").map_err(repository_error)?,
                wip_limit: row
                    .try_get::<Option<i16>, _>("wip_limit")
                    .map_err(repository_error)?
                    .and_then(|limit| u8::try_from(limit).ok()),
                config: crate::list_repo::row_to_config(row)?,
                image_version: row.try_get("image_version").map_err(repository_error)?,
                cards: Vec::new(),
            });
        }

        for row in &card_rows {
            let card_id: Uuid = row.try_get("id").map_err(repository_error)?;
            let list_id: Uuid = row.try_get("list_id").map_err(repository_error)?;
            let card = CardSummary {
                id: card_id,
                list_id,
                title: row.try_get("title").map_err(repository_error)?,
                has_description: row.try_get("has_description").map_err(repository_error)?,
                description_preview: row.try_get("preview").map_err(repository_error)?,
                label_ids: labels_by_card.remove(&card_id).unwrap_or_default(),
                assignee_ids: assignees_by_card.remove(&card_id).unwrap_or_default(),
                due_date: row.try_get("due_date").map_err(repository_error)?,
            };
            if let Some(index) = list_positions.get(&list_id) {
                lists[*index].cards.push(card);
            }
        }

        let labels = label_rows
            .iter()
            .map(row_to_label)
            .collect::<Result<Vec<_>, _>>()?;

        Ok(BoardView {
            board,
            role,
            look,
            members,
            lists,
            labels,
        })
    }

    async fn rename(&self, user_id: Uuid, id: Uuid, name: Title) -> Result<Board, BoardsError> {
        let Some(row) = sqlx::query(concat!(
            "UPDATE boards b SET name = $3 FROM workspaces w \
                WHERE b.id = $2 AND w.id = b.workspace_id AND ",
            writer_of!("$1"),
            " RETURNING b.id, b.workspace_id, b.name"
        ))
        .bind(user_id)
        .bind(id)
        .bind(name.as_str())
        .fetch_optional(&self.pool)
        .await
        .map_err(repository_error)?
        else {
            return Err(denial(&self.pool, Kind::Board, user_id, id).await);
        };

        row_to_board(&row)
    }

    async fn delete(&self, user_id: Uuid, id: Uuid) -> Result<(), BoardsError> {
        let result = sqlx::query(concat!(
            "DELETE FROM boards b USING workspaces w \
                WHERE b.id = $2 AND w.id = b.workspace_id AND ",
            admin_of!("$1")
        ))
        .bind(user_id)
        .bind(id)
        .execute(&self.pool)
        .await
        .map_err(repository_error)?;

        if result.rows_affected() == 0 {
            return Err(denial(&self.pool, Kind::Board, user_id, id).await);
        }

        Ok(())
    }

    async fn set_look(
        &self,
        user_id: Uuid,
        id: Uuid,
        look: BoardLook,
    ) -> Result<BoardLook, BoardsError> {
        let Some(row) = sqlx::query(concat!(
            "UPDATE boards b SET background = $3, accent = $4 FROM workspaces w \
                WHERE b.id = $2 AND w.id = b.workspace_id AND ",
            writer_of!("$1"),
            " RETURNING b.background, b.accent"
        ))
        .bind(user_id)
        .bind(id)
        .bind(look.background.as_str())
        .bind(look.accent.as_str())
        .fetch_optional(&self.pool)
        .await
        .map_err(repository_error)?
        else {
            return Err(denial(&self.pool, Kind::Board, user_id, id).await);
        };

        row_to_look(&row)
    }
}
