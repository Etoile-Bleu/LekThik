use std::sync::Arc;

use domain::boards::{BoardsError, CardRepo, CardSummary};
use uuid::Uuid;

pub struct DuplicateCard {
    repo: Arc<dyn CardRepo>,
}

impl DuplicateCard {
    pub fn new(repo: Arc<dyn CardRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(&self, user_id: Uuid, id: Uuid) -> Result<CardSummary, BoardsError> {
        self.repo.duplicate(user_id, id).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockCardRepo;

    use super::*;

    fn summary(id: Uuid) -> CardSummary {
        CardSummary {
            id,
            list_id: Uuid::new_v4(),
            title: "Plan (copy)".to_string(),
            has_description: false,
            description_preview: String::new(),
            label_ids: Vec::new(),
            assignee_ids: Vec::new(),
            due_date: None,
            comment_count: 0,
        }
    }

    #[tokio::test]
    async fn copies_the_card_for_the_person_who_asked() {
        let user_id = Uuid::new_v4();
        let id = Uuid::new_v4();
        let mut repo = MockCardRepo::new();
        repo.expect_duplicate()
            .times(1)
            .withf(move |user, card| *user == user_id && *card == id)
            .returning(|_, _| Ok(summary(Uuid::new_v4())));

        let copy = DuplicateCard::new(Arc::new(repo))
            .execute(user_id, id)
            .await
            .expect("duplicating should succeed");

        assert_eq!(copy.title, "Plan (copy)");
    }

    #[tokio::test]
    async fn passes_a_refusal_on() {
        let mut repo = MockCardRepo::new();
        repo.expect_duplicate()
            .returning(|_, _| Err(BoardsError::Forbidden));

        let result = DuplicateCard::new(Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4())
            .await;

        assert_eq!(result, Err(BoardsError::Forbidden));
    }
}
