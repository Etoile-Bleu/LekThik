use std::sync::Arc;

use domain::boards::{BlockConfig, BoardsError, List, ListKind, ListRepo};
use serde_json::Value;
use uuid::Uuid;

pub struct SetBlockConfig {
    repo: Arc<dyn ListRepo>,
}

impl SetBlockConfig {
    pub fn new(repo: Arc<dyn ListRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        id: Uuid,
        kind: &str,
        config: Value,
    ) -> Result<List, BoardsError> {
        let kind = ListKind::parse(kind)?;
        if kind == ListKind::List {
            return Err(BoardsError::Invalid("a list has no settings".to_string()));
        }
        let config = BlockConfig::parse(kind, config)?;
        self.repo.set_config(user_id, id, config).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockListRepo;
    use serde_json::json;

    use super::*;

    #[tokio::test]
    async fn saves_checked_settings() {
        let mut repo = MockListRepo::new();
        repo.expect_set_config()
            .times(1)
            .withf(|_, _, config| config.kind() == ListKind::Note)
            .returning(|_, id, config| {
                Ok(List {
                    id,
                    board_id: Uuid::new_v4(),
                    name: "Rules".to_string(),
                    wip_limit: None,
                    config,
                })
            });

        let block = SetBlockConfig::new(Arc::new(repo))
            .execute(
                Uuid::new_v4(),
                Uuid::new_v4(),
                "note",
                json!({ "text": "Be kind" }),
            )
            .await
            .expect("saving should succeed");

        assert_eq!(block.config.kind(), ListKind::Note);
    }

    #[tokio::test]
    async fn refuses_bad_settings_without_asking_the_repository() {
        for (kind, config) in [
            ("list", json!({})),
            ("note", json!({ "text": "x".repeat(10_001) })),
            ("agenda", json!({ "range": "decade" })),
            ("nope", json!({})),
        ] {
            let result = SetBlockConfig::new(Arc::new(MockListRepo::new()))
                .execute(Uuid::new_v4(), Uuid::new_v4(), kind, config)
                .await;

            assert!(matches!(result, Err(BoardsError::Invalid(_))), "{kind}");
        }
    }
}
