use std::sync::Arc;

use domain::boards::{BoardRepo, BoardsError};
use uuid::Uuid;

pub struct DeleteBoard {
    repo: Arc<dyn BoardRepo>,
}

impl DeleteBoard {
    pub fn new(repo: Arc<dyn BoardRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(&self, user_id: Uuid, id: Uuid) -> Result<(), BoardsError> {
        self.repo.delete(user_id, id).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockBoardRepo;

    use super::*;

    #[tokio::test]
    async fn deletes_the_board_for_the_owner() {
        let user_id = Uuid::new_v4();
        let id = Uuid::new_v4();
        let mut repo = MockBoardRepo::new();
        repo.expect_delete()
            .times(1)
            .withf(move |owner, target| *owner == user_id && *target == id)
            .returning(|_, _| Ok(()));

        let result = DeleteBoard::new(Arc::new(repo)).execute(user_id, id).await;

        assert_eq!(result, Ok(()));
    }
}
