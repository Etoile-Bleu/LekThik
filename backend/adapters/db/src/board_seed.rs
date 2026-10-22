use std::collections::HashMap;

use domain::boards::{Board, BoardTemplate, BoardsError};
use sqlx::{Postgres, Row, Transaction};
use uuid::Uuid;

use crate::scope::repository_error;

pub(crate) async fn insert_board(
    transaction: &mut Transaction<'_, Postgres>,
    workspace_id: Uuid,
    name: &str,
    template: Option<&BoardTemplate>,
) -> Result<Board, BoardsError> {
    // clock_timestamp, not now(): the boards of a workspace template are created in one
    // transaction, and now() would give them all the same instant and so an arbitrary order.
    let row = sqlx::query(
        "INSERT INTO boards (workspace_id, name, created_at) VALUES ($1, $2, clock_timestamp()) \
            RETURNING id, workspace_id, name",
    )
    .bind(workspace_id)
    .bind(name)
    .fetch_one(&mut **transaction)
    .await
    .map_err(repository_error)?;

    let board = Board {
        id: row.try_get("id").map_err(repository_error)?,
        workspace_id: row.try_get("workspace_id").map_err(repository_error)?,
        name: row.try_get("name").map_err(repository_error)?,
    };

    match template {
        Some(template) => apply_template(transaction, board.id, template).await?,
        None => insert_default_labels(transaction, board.id).await?,
    }

    Ok(board)
}

async fn insert_default_labels(
    transaction: &mut Transaction<'_, Postgres>,
    board_id: Uuid,
) -> Result<(), BoardsError> {
    sqlx::query(
        "INSERT INTO labels (board_id, name, color, priority) VALUES \
            ($1, 'Urgent', 'red', 4), \
            ($1, 'High', 'orange', 3), \
            ($1, 'Medium', 'amber', 2), \
            ($1, 'Low', 'blue', 1)",
    )
    .bind(board_id)
    .execute(&mut **transaction)
    .await
    .map_err(repository_error)?;

    Ok(())
}

async fn apply_template(
    transaction: &mut Transaction<'_, Postgres>,
    board_id: Uuid,
    template: &BoardTemplate,
) -> Result<(), BoardsError> {
    let mut label_ids: HashMap<&str, Uuid> = HashMap::new();

    for label in template.labels {
        let id: Uuid = sqlx::query_scalar(
            "INSERT INTO labels (board_id, name, color, priority, created_at) \
                VALUES ($1, $2, $3, $4, clock_timestamp()) RETURNING id",
        )
        .bind(board_id)
        .bind(label.name)
        .bind(label.color.as_str())
        .bind(label.priority.level())
        .fetch_one(&mut **transaction)
        .await
        .map_err(repository_error)?;
        label_ids.insert(label.name, id);
    }

    for (list_index, list) in template.lists.iter().enumerate() {
        let list_id: Uuid = sqlx::query_scalar(
            "INSERT INTO lists (board_id, name, position) VALUES ($1, $2, $3) RETURNING id",
        )
        .bind(board_id)
        .bind(list.name)
        .bind(list_index as i32)
        .fetch_one(&mut **transaction)
        .await
        .map_err(repository_error)?;

        for (card_index, card) in list.cards.iter().enumerate() {
            let card_id: Uuid = sqlx::query_scalar(
                "INSERT INTO cards (list_id, title, description, position) \
                    VALUES ($1, $2, $3, $4) RETURNING id",
            )
            .bind(list_id)
            .bind(card.title)
            .bind(card.description)
            .bind(card_index as i32)
            .fetch_one(&mut **transaction)
            .await
            .map_err(repository_error)?;

            for label_name in card.labels {
                let label_id = label_ids.get(label_name).ok_or_else(|| {
                    BoardsError::Repository(format!(
                        "template {} uses the unknown label {label_name}",
                        template.id
                    ))
                })?;

                sqlx::query("INSERT INTO card_labels (card_id, label_id) VALUES ($1, $2)")
                    .bind(card_id)
                    .bind(label_id)
                    .execute(&mut **transaction)
                    .await
                    .map_err(repository_error)?;
            }
        }
    }

    Ok(())
}
