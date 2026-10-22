use std::sync::Arc;

use domain::boards::{AssignedCard, BoardsError, CardRepo};
use uuid::Uuid;

pub struct ListMyCards {
    repo: Arc<dyn CardRepo>,
}

impl ListMyCards {
    pub fn new(repo: Arc<dyn CardRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(&self, user_id: Uuid) -> Result<Vec<AssignedCard>, BoardsError> {
        self.repo.assigned_to(user_id).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockCardRepo;

    use super::*;

    #[tokio::test]
    async fn returns_what_the_repository_finds_for_that_user() {
        let user_id = Uuid::new_v4();
        let mut repo = MockCardRepo::new();
        repo.expect_assigned_to()
            .times(1)
            .withf(move |user| *user == user_id)
            .returning(|_| {
                Ok(vec![AssignedCard {
                    id: Uuid::new_v4(),
                    title: "Ship it".to_string(),
                    due_date: Some("2026-11-02".to_string()),
                    list_id: Uuid::new_v4(),
                    list_name: "Doing".to_string(),
                    board_id: Uuid::new_v4(),
                    board_name: "Launch".to_string(),
                    workspace_id: Uuid::new_v4(),
                    workspace_name: "Studio".to_string(),
                }])
            });

        let cards = ListMyCards::new(Arc::new(repo))
            .execute(user_id)
            .await
            .expect("listing should succeed");

        assert_eq!(cards.len(), 1);
        assert_eq!(cards[0].title, "Ship it");
    }
}
