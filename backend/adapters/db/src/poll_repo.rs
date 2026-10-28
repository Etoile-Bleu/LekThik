use std::collections::HashMap;

use async_trait::async_trait;
use domain::boards::{
    BlockConfig, BoardsError, PollConfig, PollCount, PollRepo, PollTally, PollVoters,
};
use sqlx::{PgConnection, PgPool, Row};
use uuid::Uuid;

use crate::list_repo::row_to_config;
use crate::scope::{Kind, denial, repository_error};

pub struct PgPollRepo {
    pool: PgPool,
}

impl PgPollRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    async fn open_poll(
        &self,
        connection: &mut PgConnection,
        user_id: Uuid,
        list_id: Uuid,
    ) -> Result<PollConfig, BoardsError> {
        let Some(row) = sqlx::query(concat!(
            "SELECT l.kind, l.config::text AS config FROM ",
            owned_list!(),
            " WHERE l.id = $1 AND ",
            member_of!("$2"),
            " FOR UPDATE OF l"
        ))
        .bind(list_id)
        .bind(user_id)
        .fetch_optional(&mut *connection)
        .await
        .map_err(repository_error)?
        else {
            return Err(denial(&self.pool, Kind::List, user_id, list_id).await);
        };
        match row_to_config(&row)? {
            BlockConfig::Poll(poll) if poll.closed => {
                Err(BoardsError::Conflict("this poll is closed".to_string()))
            }
            BlockConfig::Poll(poll) => Ok(poll),
            _ => Err(BoardsError::NotFound),
        }
    }
}

#[async_trait]
impl PollRepo for PgPollRepo {
    async fn vote(&self, user_id: Uuid, list_id: Uuid, option_id: &str) -> Result<(), BoardsError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;
        let poll = self.open_poll(&mut transaction, user_id, list_id).await?;
        if !poll.has_option(option_id) {
            return Err(BoardsError::Invalid(
                "that is not an option of this poll".to_string(),
            ));
        }
        sqlx::query(
            "INSERT INTO poll_votes (list_id, user_id, option_id) VALUES ($1, $2, $3) \
                ON CONFLICT (list_id, user_id) \
                DO UPDATE SET option_id = EXCLUDED.option_id, voted_at = now()",
        )
        .bind(list_id)
        .bind(user_id)
        .bind(option_id)
        .execute(&mut *transaction)
        .await
        .map_err(repository_error)?;
        transaction.commit().await.map_err(repository_error)
    }

    async fn withdraw(&self, user_id: Uuid, list_id: Uuid) -> Result<(), BoardsError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;
        self.open_poll(&mut transaction, user_id, list_id).await?;
        sqlx::query("DELETE FROM poll_votes WHERE list_id = $1 AND user_id = $2")
            .bind(list_id)
            .bind(user_id)
            .execute(&mut *transaction)
            .await
            .map_err(repository_error)?;
        transaction.commit().await.map_err(repository_error)
    }
}

pub(crate) async fn tallies_of_board(
    connection: &mut PgConnection,
    board_id: Uuid,
    viewer: Uuid,
) -> Result<Vec<PollTally>, BoardsError> {
    let list_rows = sqlx::query(
        "SELECT id, kind, config::text AS config FROM lists \
            WHERE board_id = $1 AND kind = 'poll' ORDER BY position, id",
    )
    .bind(board_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(repository_error)?;
    if list_rows.is_empty() {
        return Ok(Vec::new());
    }

    let vote_rows = sqlx::query(
        "SELECT v.list_id, v.option_id, v.user_id FROM poll_votes v \
            JOIN lists l ON l.id = v.list_id WHERE l.board_id = $1 ORDER BY v.voted_at, v.user_id",
    )
    .bind(board_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(repository_error)?;
    let mut votes: HashMap<Uuid, Vec<(String, Uuid)>> = HashMap::new();
    for row in &vote_rows {
        let list_id: Uuid = row.try_get("list_id").map_err(repository_error)?;
        let option_id: String = row.try_get("option_id").map_err(repository_error)?;
        let user_id: Uuid = row.try_get("user_id").map_err(repository_error)?;
        votes.entry(list_id).or_default().push((option_id, user_id));
    }

    let mut tallies = Vec::with_capacity(list_rows.len());
    for row in &list_rows {
        let BlockConfig::Poll(poll) = row_to_config(row)? else {
            continue;
        };
        let list_id: Uuid = row.try_get("id").map_err(repository_error)?;
        let cast = votes.remove(&list_id).unwrap_or_default();
        let counts = poll
            .options
            .iter()
            .map(|option| PollCount {
                option_id: option.id.clone(),
                votes: cast.iter().filter(|(id, _)| *id == option.id).count() as i64,
            })
            .collect();
        let voters = poll.show_voters.then(|| {
            poll.options
                .iter()
                .map(|option| PollVoters {
                    option_id: option.id.clone(),
                    user_ids: cast
                        .iter()
                        .filter(|(id, _)| *id == option.id)
                        .map(|(_, user_id)| *user_id)
                        .collect(),
                })
                .collect()
        });
        tallies.push(PollTally {
            list_id,
            counts,
            total: cast.len() as i64,
            mine: cast
                .iter()
                .find(|(_, user_id)| *user_id == viewer)
                .map(|(option_id, _)| option_id.clone()),
            voters,
        });
    }
    Ok(tallies)
}

pub(crate) async fn apply_config_change(
    connection: &mut PgConnection,
    list_id: Uuid,
    config: &BlockConfig,
) -> Result<(), BoardsError> {
    let BlockConfig::Poll(poll) = config else {
        return Ok(());
    };
    let row =
        sqlx::query("SELECT kind, config::text AS config FROM lists WHERE id = $1 FOR UPDATE")
            .bind(list_id)
            .fetch_one(&mut *connection)
            .await
            .map_err(repository_error)?;
    let BlockConfig::Poll(before) = row_to_config(&row)? else {
        return Ok(());
    };

    if before.show_voters != poll.show_voters {
        let voted = sqlx::query("SELECT 1 FROM poll_votes WHERE list_id = $1 LIMIT 1")
            .bind(list_id)
            .fetch_optional(&mut *connection)
            .await
            .map_err(repository_error)?;
        if voted.is_some() {
            return Err(BoardsError::Conflict(
                "whether names are shown cannot change once someone has voted".to_string(),
            ));
        }
    }

    let kept: Vec<String> = poll
        .options
        .iter()
        .map(|option| option.id.clone())
        .collect();
    sqlx::query("DELETE FROM poll_votes WHERE list_id = $1 AND option_id <> ALL($2)")
        .bind(list_id)
        .bind(&kept)
        .execute(&mut *connection)
        .await
        .map_err(repository_error)?;
    Ok(())
}
