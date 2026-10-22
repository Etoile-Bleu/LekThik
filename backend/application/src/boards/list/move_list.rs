use std::sync::Arc;

use domain::boards::{BoardsError, ListRepo};
use uuid::Uuid;

pub struct MoveList {
    repo: Arc<dyn ListRepo>,
}

impl MoveList {
    pub fn new(repo: Arc<dyn ListRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(&self, user_id: Uuid, id: Uuid, index: usize) -> Result<(), BoardsError> {
        self.repo.move_to(user_id, id, index).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockListRepo;

    use super::*;

    #[tokio::test]
    async fn asks_the_repository_to_place_the_list_at_the_index() {
        let id = Uuid::new_v4();
        let mut repo = MockListRepo::new();
        repo.expect_move_to()
            .times(1)
            .withf(move |_, target, index| *target == id && *index == 2)
            .returning(|_, _, _| Ok(()));

        let result = MoveList::new(Arc::new(repo))
            .execute(Uuid::new_v4(), id, 2)
            .await;

        assert_eq!(result, Ok(()));
    }

    #[tokio::test]
    async fn reports_not_found_for_a_list_the_owner_does_not_have() {
        let mut repo = MockListRepo::new();
        repo.expect_move_to()
            .returning(|_, _, _| Err(BoardsError::NotFound));

        let result = MoveList::new(Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4(), 0)
            .await;

        assert_eq!(result, Err(BoardsError::NotFound));
    }
}
