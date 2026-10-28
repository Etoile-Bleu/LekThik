use async_trait::async_trait;
use domain::boards::{
    ActivityKind, AssignedCard, BoardsError, Card, CardRepo, CardSummary, CardUpdate, Description,
    MAX_ASSIGNEES_PER_CARD, MAX_CARDS_PER_LIST, Title,
};
use sqlx::postgres::PgRow;
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::activity::{Entry, record};
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

    async fn assignee_ids_of(&self, card_id: Uuid) -> Result<Vec<Uuid>, BoardsError> {
        sqlx::query_scalar(
            "SELECT user_id FROM card_assignees WHERE card_id = $1 ORDER BY assigned_at, user_id",
        )
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
            assignee_ids: self.assignee_ids_of(id).await?,
            due_date: row.try_get("due_date").map_err(repository_error)?,
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
            "SELECT l.id, l.kind, l.name FROM ",
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
        let Some(locked) = locked else {
            return Err(denial(&self.pool, Kind::List, user_id, list_id).await);
        };
        let kind: String = locked.try_get("kind").map_err(repository_error)?;
        let list_name: String = locked.try_get("name").map_err(repository_error)?;
        if kind != "list" {
            return Err(BoardsError::Invalid(
                "cards can only be added to lists".to_string(),
            ));
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

        let created_id: Uuid = row.try_get("id").map_err(repository_error)?;
        record(
            &mut transaction,
            created_id,
            user_id,
            Entry::naming(ActivityKind::Created, &list_name),
        )
        .await?;

        transaction.commit().await.map_err(repository_error)?;

        Ok(CardSummary {
            id: row.try_get("id").map_err(repository_error)?,
            list_id: row.try_get("list_id").map_err(repository_error)?,
            title: row.try_get("title").map_err(repository_error)?,
            has_description: false,
            description_preview: String::new(),
            label_ids: Vec::new(),
            assignee_ids: Vec::new(),
            due_date: None,
            comment_count: 0,
        })
    }

    async fn duplicate(&self, user_id: Uuid, id: Uuid) -> Result<CardSummary, BoardsError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;

        let Some(original) = sqlx::query(concat!(
            "SELECT c.list_id, c.title, c.description, c.due_date::text AS due_date, c.position \
                FROM ",
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
        let list_id: Uuid = original.try_get("list_id").map_err(repository_error)?;
        let title: String = original.try_get("title").map_err(repository_error)?;
        let description: String = original.try_get("description").map_err(repository_error)?;
        let due_date: Option<String> = original.try_get("due_date").map_err(repository_error)?;
        let position: i32 = original.try_get("position").map_err(repository_error)?;

        let existing: i64 = sqlx::query_scalar("SELECT count(*) FROM cards WHERE list_id = $1")
            .bind(list_id)
            .fetch_one(&mut *transaction)
            .await
            .map_err(repository_error)?;
        if existing >= MAX_CARDS_PER_LIST {
            return Err(BoardsError::LimitReached("cards"));
        }

        let copy_title = Title::parse(&title)?.copy_of();

        // Room is made right after the original, so the copy sits beside it.
        sqlx::query(
            "UPDATE cards SET position = position + 1 WHERE list_id = $1 AND position > $2",
        )
        .bind(list_id)
        .bind(position)
        .execute(&mut *transaction)
        .await
        .map_err(repository_error)?;

        let new_id: Uuid = sqlx::query_scalar(
            "INSERT INTO cards (list_id, title, description, due_date, position) \
                VALUES ($1, $2, $3, $4::date, $5) RETURNING id",
        )
        .bind(list_id)
        .bind(copy_title.as_str())
        .bind(&description)
        .bind(&due_date)
        .bind(position + 1)
        .fetch_one(&mut *transaction)
        .await
        .map_err(repository_error)?;

        sqlx::query(
            "INSERT INTO card_labels (card_id, label_id) \
                SELECT $1, label_id FROM card_labels WHERE card_id = $2",
        )
        .bind(new_id)
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(repository_error)?;

        sqlx::query(
            "INSERT INTO card_assignees (card_id, user_id) \
                SELECT $1, user_id FROM card_assignees WHERE card_id = $2",
        )
        .bind(new_id)
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(repository_error)?;

        sqlx::query(
            "INSERT INTO card_field_values \
                (card_id, field_id, text_value, number_value, date_value, bool_value, option_id) \
                SELECT $1, field_id, text_value, number_value, date_value, bool_value, option_id \
                FROM card_field_values WHERE card_id = $2",
        )
        .bind(new_id)
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(repository_error)?;

        record(
            &mut transaction,
            new_id,
            user_id,
            Entry::from(ActivityKind::Created, &title),
        )
        .await?;

        transaction.commit().await.map_err(repository_error)?;

        Ok(CardSummary {
            id: new_id,
            list_id,
            title: copy_title.into_string(),
            has_description: !description.is_empty(),
            description_preview: description.chars().take(140).collect(),
            label_ids: self.label_ids_of(new_id).await?,
            assignee_ids: self.assignee_ids_of(new_id).await?,
            due_date,
            comment_count: 0,
        })
    }

    async fn get(&self, user_id: Uuid, id: Uuid) -> Result<Card, BoardsError> {
        let row = sqlx::query(concat!(
            "SELECT c.id, c.list_id, c.title, c.description, c.due_date::text AS due_date FROM ",
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

    async fn assigned_to(&self, user_id: Uuid) -> Result<Vec<AssignedCard>, BoardsError> {
        let rows = sqlx::query(concat!(
            "SELECT c.id, c.title, c.due_date::text AS due_date, l.id AS list_id, \
                l.name AS list_name, b.id AS board_id, b.name AS board_name, \
                w.id AS workspace_id, w.name AS workspace_name \
                FROM card_assignees ca JOIN cards c ON c.id = ca.card_id \
                JOIN lists l ON l.id = c.list_id JOIN boards b ON b.id = l.board_id \
                JOIN workspaces w ON w.id = b.workspace_id \
                WHERE ca.user_id = $1 AND ",
            member_of!("$1"),
            " ORDER BY c.due_date NULLS LAST, c.created_at, c.id LIMIT 500"
        ))
        .bind(user_id)
        .fetch_all(&self.pool)
        .await
        .map_err(repository_error)?;

        rows.iter()
            .map(|row| {
                Ok(AssignedCard {
                    id: row.try_get("id").map_err(repository_error)?,
                    title: row.try_get("title").map_err(repository_error)?,
                    due_date: row.try_get("due_date").map_err(repository_error)?,
                    list_id: row.try_get("list_id").map_err(repository_error)?,
                    list_name: row.try_get("list_name").map_err(repository_error)?,
                    board_id: row.try_get("board_id").map_err(repository_error)?,
                    board_name: row.try_get("board_name").map_err(repository_error)?,
                    workspace_id: row.try_get("workspace_id").map_err(repository_error)?,
                    workspace_name: row.try_get("workspace_name").map_err(repository_error)?,
                })
            })
            .collect()
    }

    async fn update(
        &self,
        user_id: Uuid,
        id: Uuid,
        update: CardUpdate,
    ) -> Result<Card, BoardsError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;

        let Some(before) = sqlx::query(concat!(
            "SELECT c.title, c.description, c.due_date::text AS due_date FROM ",
            owned_card!(),
            " WHERE c.id = $1 AND ",
            writer_of!("$2"),
            " FOR UPDATE OF c"
        ))
        .bind(id)
        .bind(user_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(repository_error)?
        else {
            return Err(denial(&self.pool, Kind::Card, user_id, id).await);
        };
        let old_title: String = before.try_get("title").map_err(repository_error)?;
        let old_description: String = before.try_get("description").map_err(repository_error)?;
        let old_due: Option<String> = before.try_get("due_date").map_err(repository_error)?;

        let Some(row) = sqlx::query(concat!(
            "UPDATE cards c SET \
                title = COALESCE($3, c.title), \
                description = COALESCE($4, c.description), \
                due_date = CASE WHEN $5 THEN $6::date ELSE c.due_date END, \
                updated_at = now() \
                FROM lists l, boards b, workspaces w \
                WHERE c.id = $2 AND l.id = c.list_id AND b.id = l.board_id \
                    AND w.id = b.workspace_id AND ",
            writer_of!("$1"),
            " RETURNING c.id, c.list_id, c.title, c.description, c.due_date::text AS due_date"
        ))
        .bind(user_id)
        .bind(id)
        .bind(update.title.as_ref().map(Title::as_str))
        .bind(update.description.as_ref().map(Description::as_str))
        .bind(update.due_date.is_some())
        .bind(
            update
                .due_date
                .as_ref()
                .and_then(|day| day.as_ref())
                .map(|day| day.as_str()),
        )
        .fetch_optional(&mut *transaction)
        .await
        .map_err(repository_error)?
        else {
            return Err(denial(&self.pool, Kind::Card, user_id, id).await);
        };

        let new_title: String = row.try_get("title").map_err(repository_error)?;
        let new_description: String = row.try_get("description").map_err(repository_error)?;
        let new_due: Option<String> = row.try_get("due_date").map_err(repository_error)?;
        if new_title != old_title {
            record(
                &mut transaction,
                id,
                user_id,
                Entry::between(ActivityKind::Renamed, &old_title, &new_title),
            )
            .await?;
        }
        if new_description != old_description {
            record(
                &mut transaction,
                id,
                user_id,
                Entry::plain(ActivityKind::Described),
            )
            .await?;
        }
        if new_due != old_due {
            let entry = match &new_due {
                Some(day) => Entry::naming(ActivityKind::DueSet, day),
                None => Entry::plain(ActivityKind::DueCleared),
            };
            record(&mut transaction, id, user_id, entry).await?;
        }

        transaction.commit().await.map_err(repository_error)?;

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

        let target = sqlx::query("SELECT kind FROM lists WHERE id = $1 AND board_id = $2")
            .bind(list_id)
            .bind(board_id)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(repository_error)?;
        let Some(target) = target else {
            return Err(BoardsError::NotFound);
        };
        let target_kind: String = target.try_get("kind").map_err(repository_error)?;
        if target_kind != "list" {
            return Err(BoardsError::Invalid(
                "cards can only be moved into lists".to_string(),
            ));
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

        if source_list_id != list_id {
            let names: Vec<(Uuid, String)> =
                sqlx::query_as("SELECT id, name FROM lists WHERE id = ANY($1)")
                    .bind(vec![source_list_id, list_id])
                    .fetch_all(&mut *transaction)
                    .await
                    .map_err(repository_error)?;
            let name_of = |wanted: Uuid| {
                names
                    .iter()
                    .find(|(found, _)| *found == wanted)
                    .map(|(_, name)| name.as_str())
                    .unwrap_or("")
            };
            record(
                &mut transaction,
                id,
                user_id,
                Entry::between(
                    ActivityKind::Moved,
                    name_of(source_list_id),
                    name_of(list_id),
                ),
            )
            .await?;
        }

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

        let before: Vec<(Uuid, String)> = sqlx::query_as(
            "SELECT lb.id, lb.name FROM card_labels cl JOIN labels lb ON lb.id = cl.label_id \
                WHERE cl.card_id = $1 ORDER BY lb.name",
        )
        .bind(id)
        .fetch_all(&mut *transaction)
        .await
        .map_err(repository_error)?;

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

        let added_ids: Vec<Uuid> = label_ids
            .iter()
            .copied()
            .filter(|label| !before.iter().any(|(kept, _)| kept == label))
            .collect();
        let added: Vec<(Uuid, String)> =
            sqlx::query_as("SELECT id, name FROM labels WHERE id = ANY($1) ORDER BY name")
                .bind(&added_ids)
                .fetch_all(&mut *transaction)
                .await
                .map_err(repository_error)?;
        for (_, name) in &added {
            record(
                &mut transaction,
                id,
                user_id,
                Entry::naming(ActivityKind::LabelAdded, name),
            )
            .await?;
        }
        for (_, name) in before.iter().filter(|(kept, _)| !label_ids.contains(kept)) {
            record(
                &mut transaction,
                id,
                user_id,
                Entry::naming(ActivityKind::LabelRemoved, name),
            )
            .await?;
        }

        transaction.commit().await.map_err(repository_error)?;

        Ok(label_ids)
    }

    async fn set_assignees(
        &self,
        user_id: Uuid,
        id: Uuid,
        assignee_ids: Vec<Uuid>,
    ) -> Result<Vec<Uuid>, BoardsError> {
        if assignee_ids.len() as i64 > MAX_ASSIGNEES_PER_CARD {
            return Err(BoardsError::LimitReached("assignees"));
        }

        let mut transaction = self.pool.begin().await.map_err(repository_error)?;

        let Some(workspace_id) = sqlx::query_scalar::<_, Uuid>(concat!(
            "SELECT w.id FROM ",
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

        if !assignee_ids.is_empty() {
            let members: i64 = sqlx::query_scalar(
                "SELECT count(*) FROM workspace_members WHERE workspace_id = $1 AND user_id = ANY($2)",
            )
            .bind(workspace_id)
            .bind(&assignee_ids)
            .fetch_one(&mut *transaction)
            .await
            .map_err(repository_error)?;

            if members != assignee_ids.len() as i64 {
                return Err(BoardsError::Invalid(
                    "only members of the workspace can be assigned".to_string(),
                ));
            }
        }

        let before: Vec<Uuid> =
            sqlx::query_scalar("SELECT user_id FROM card_assignees WHERE card_id = $1")
                .bind(id)
                .fetch_all(&mut *transaction)
                .await
                .map_err(repository_error)?;

        sqlx::query("DELETE FROM card_assignees WHERE card_id = $1 AND NOT (user_id = ANY($2))")
            .bind(id)
            .bind(&assignee_ids)
            .execute(&mut *transaction)
            .await
            .map_err(repository_error)?;

        sqlx::query(
            "INSERT INTO card_assignees (card_id, user_id) SELECT $1, UNNEST($2::uuid[]) \
                ON CONFLICT (card_id, user_id) DO NOTHING",
        )
        .bind(id)
        .bind(&assignee_ids)
        .execute(&mut *transaction)
        .await
        .map_err(repository_error)?;

        for assignee in assignee_ids
            .iter()
            .filter(|person| !before.contains(person))
        {
            record(
                &mut transaction,
                id,
                user_id,
                Entry::about(ActivityKind::Assigned, *assignee),
            )
            .await?;
        }
        for assignee in before
            .iter()
            .filter(|person| !assignee_ids.contains(person))
        {
            record(
                &mut transaction,
                id,
                user_id,
                Entry::about(ActivityKind::Unassigned, *assignee),
            )
            .await?;
        }

        transaction.commit().await.map_err(repository_error)?;

        Ok(assignee_ids)
    }
}
