use std::sync::Arc;

use domain::boards::{BoardsError, Card, CardRepo};
use uuid::Uuid;

pub struct GetCard {
    repo: Arc<dyn CardRepo>,
}

impl GetCard {
    pub fn new(repo: Arc<dyn CardRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(&self, user_id: Uuid, id: Uuid) -> Result<Card, BoardsError> {
        self.repo.get(user_id, id).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockCardRepo;

    use super::*;

    #[tokio::test]
    async fn returns_the_card_for_the_owner() {
        let user_id = Uuid::new_v4();
        let id = Uuid::new_v4();
        let card = Card {
            id,
            list_id: Uuid::new_v4(),
            title: "Write tests".to_string(),
            description: "Cover the move path".to_string(),
            label_ids: Vec::new(),
        };

        let mut repo = MockCardRepo::new();
        let returned = card.clone();
        repo.expect_get()
            .times(1)
            .withf(move |owner, target| *owner == user_id && *target == id)
            .returning(move |_, _| Ok(returned.clone()));

        let result = GetCard::new(Arc::new(repo)).execute(user_id, id).await;

        assert_eq!(result, Ok(card));
    }

    #[tokio::test]
    async fn reports_not_found_for_someone_elses_card() {
        let mut repo = MockCardRepo::new();
        repo.expect_get()
            .returning(|_, _| Err(BoardsError::NotFound));

        let result = GetCard::new(Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4())
            .await;

        assert_eq!(result, Err(BoardsError::NotFound));
    }
}
