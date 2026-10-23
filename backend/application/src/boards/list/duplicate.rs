use std::sync::Arc;

use domain::boards::{BoardsError, List, ListRepo};
use uuid::Uuid;

pub struct DuplicatePanel {
    repo: Arc<dyn ListRepo>,
}

impl DuplicatePanel {
    pub fn new(repo: Arc<dyn ListRepo>) -> Self {
        Self { repo }
    }

    /// Copies a list with its cards, or a block with its settings and picture.
    pub async fn execute(&self, user_id: Uuid, id: Uuid) -> Result<List, BoardsError> {
        self.repo.duplicate(user_id, id).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::{BlockConfig, MockListRepo};

    use super::*;

    #[tokio::test]
    async fn copies_the_panel() {
        let mut repo = MockListRepo::new();
        repo.expect_duplicate().times(1).returning(|_, _| {
            Ok(List {
                id: Uuid::new_v4(),
                board_id: Uuid::new_v4(),
                name: "Doing (copy)".to_string(),
                wip_limit: None,
                config: BlockConfig::List,
            })
        });

        let copy = DuplicatePanel::new(Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4())
            .await
            .expect("duplicating should succeed");

        assert_eq!(copy.name, "Doing (copy)");
    }

    #[tokio::test]
    async fn stops_at_the_limit() {
        let mut repo = MockListRepo::new();
        repo.expect_duplicate()
            .returning(|_, _| Err(BoardsError::LimitReached("lists")));

        let result = DuplicatePanel::new(Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4())
            .await;

        assert_eq!(result, Err(BoardsError::LimitReached("lists")));
    }
}
