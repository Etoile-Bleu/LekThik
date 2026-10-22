use std::sync::Arc;

use domain::boards::{BoardsError, CardRepo};
use uuid::Uuid;

pub struct DeleteCard {
    repo: Arc<dyn CardRepo>,
}

impl DeleteCard {
    pub fn new(repo: Arc<dyn CardRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(&self, owner_id: Uuid, id: Uuid) -> Result<(), BoardsError> {
        self.repo.delete(owner_id, id).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockCardRepo;

    use super::*;

    #[tokio::test]
    async fn deletes_the_card_for_the_owner() {
        let owner_id = Uuid::new_v4();
        let id = Uuid::new_v4();
        let mut repo = MockCardRepo::new();
        repo.expect_delete()
            .times(1)
            .withf(move |owner, target| *owner == owner_id && *target == id)
            .returning(|_, _| Ok(()));

        let result = DeleteCard::new(Arc::new(repo)).execute(owner_id, id).await;

        assert_eq!(result, Ok(()));
    }
}
