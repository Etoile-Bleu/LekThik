use std::sync::Arc;

use domain::boards::{Board, BoardRepo, BoardsError, Title};
use uuid::Uuid;

pub struct RenameBoard {
    repo: Arc<dyn BoardRepo>,
}

impl RenameBoard {
    pub fn new(repo: Arc<dyn BoardRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(&self, user_id: Uuid, id: Uuid, name: &str) -> Result<Board, BoardsError> {
        let name = Title::parse(name)?;
        self.repo.rename(user_id, id, name).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockBoardRepo;

    use super::*;

    #[tokio::test]
    async fn renames_the_board_with_the_trimmed_name() {
        let mut repo = MockBoardRepo::new();
        repo.expect_rename()
            .times(1)
            .withf(|_, _, name| name.as_str() == "Sprint 2")
            .returning(|_, id, name| {
                Ok(Board {
                    id,
                    workspace_id: Uuid::new_v4(),
                    name: name.into_string(),
                })
            });

        let result = RenameBoard::new(Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4(), "  Sprint 2")
            .await;

        assert_eq!(result.expect("rename should succeed").name, "Sprint 2");
    }

    #[tokio::test]
    async fn rejects_a_blank_name() {
        let result = RenameBoard::new(Arc::new(MockBoardRepo::new()))
            .execute(Uuid::new_v4(), Uuid::new_v4(), "")
            .await;

        assert!(matches!(result, Err(BoardsError::Invalid(_))));
    }
}
