use std::sync::Arc;

use domain::boards::{BoardsError, CardRepo};
use uuid::Uuid;

pub struct MoveCard {
    repo: Arc<dyn CardRepo>,
}

impl MoveCard {
    pub fn new(repo: Arc<dyn CardRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        id: Uuid,
        list_id: Uuid,
        index: usize,
    ) -> Result<(), BoardsError> {
        self.repo.move_to(user_id, id, list_id, index).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockCardRepo;

    use super::*;

    #[tokio::test]
    async fn moves_the_card_to_the_target_list_and_index() {
        let id = Uuid::new_v4();
        let list_id = Uuid::new_v4();
        let mut repo = MockCardRepo::new();
        repo.expect_move_to()
            .times(1)
            .withf(move |_, card, list, index| *card == id && *list == list_id && *index == 3)
            .returning(|_, _, _, _| Ok(()));

        let result = MoveCard::new(Arc::new(repo))
            .execute(Uuid::new_v4(), id, list_id, 3)
            .await;

        assert_eq!(result, Ok(()));
    }

    #[tokio::test]
    async fn reports_not_found_when_the_target_list_is_not_reachable() {
        let mut repo = MockCardRepo::new();
        repo.expect_move_to()
            .returning(|_, _, _, _| Err(BoardsError::NotFound));

        let result = MoveCard::new(Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4(), 0)
            .await;

        assert_eq!(result, Err(BoardsError::NotFound));
    }
}
