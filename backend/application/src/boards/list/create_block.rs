use std::sync::Arc;

use domain::boards::{BlockConfig, BoardsError, List, ListKind, ListRepo, Title};
use serde_json::Value;
use uuid::Uuid;

pub struct CreateBlock {
    repo: Arc<dyn ListRepo>,
}

impl CreateBlock {
    pub fn new(repo: Arc<dyn ListRepo>) -> Self {
        Self { repo }
    }

    /// Adds a block of the given kind. A list of cards has its own use case.
    pub async fn execute(
        &self,
        user_id: Uuid,
        board_id: Uuid,
        kind: &str,
        name: &str,
        config: Value,
    ) -> Result<List, BoardsError> {
        let kind = ListKind::parse(kind)?;
        if kind == ListKind::List {
            return Err(BoardsError::Invalid(
                "a list is added with the lists endpoint".to_string(),
            ));
        }
        let config = BlockConfig::parse(kind, config)?;
        let name = Title::parse(name)?;
        self.repo
            .create_block(user_id, board_id, name, config)
            .await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockListRepo;
    use serde_json::json;

    use super::*;

    #[tokio::test]
    async fn adds_a_block_with_checked_settings() {
        let board_id = Uuid::new_v4();
        let mut repo = MockListRepo::new();
        repo.expect_create_block()
            .times(1)
            .withf(move |_, board, name, config| {
                *board == board_id
                    && name.as_str() == "Deadlines"
                    && config.kind() == ListKind::Calendar
            })
            .returning(|_, board_id, name, config| {
                Ok(List {
                    id: Uuid::new_v4(),
                    board_id,
                    name: name.into_string(),
                    wip_limit: None,
                    config,
                })
            });

        let block = CreateBlock::new(Arc::new(repo))
            .execute(
                Uuid::new_v4(),
                board_id,
                "calendar",
                " Deadlines ",
                json!({ "size": "wide" }),
            )
            .await
            .expect("creation should succeed");

        assert_eq!(block.name, "Deadlines");
    }

    #[tokio::test]
    async fn refuses_without_asking_the_repository() {
        for (kind, name, config) in [
            ("list", "Doing", json!({})),
            ("gantt", "Plan", json!({})),
            ("calendar", "Plan", json!({ "colour": "red" })),
            ("calendar", "  ", json!({})),
            ("counter", "Progress", json!({ "metric": "done_percent" })),
        ] {
            let result = CreateBlock::new(Arc::new(MockListRepo::new()))
                .execute(Uuid::new_v4(), Uuid::new_v4(), kind, name, config)
                .await;

            assert!(
                matches!(result, Err(BoardsError::Invalid(_))),
                "{kind} {name}"
            );
        }
    }
}
