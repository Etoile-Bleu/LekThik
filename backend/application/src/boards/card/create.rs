use std::sync::Arc;

use domain::boards::{BoardsError, CardRepo, CardSummary, Title};
use uuid::Uuid;

pub struct CreateCard {
    repo: Arc<dyn CardRepo>,
}

impl CreateCard {
    pub fn new(repo: Arc<dyn CardRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        list_id: Uuid,
        title: &str,
    ) -> Result<CardSummary, BoardsError> {
        let title = Title::parse(title)?;
        self.repo.create(user_id, list_id, title).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockCardRepo;

    use super::*;

    #[tokio::test]
    async fn creates_a_card_at_the_end_of_the_list() {
        let list_id = Uuid::new_v4();
        let mut repo = MockCardRepo::new();
        repo.expect_create()
            .times(1)
            .withf(move |_, list, title| *list == list_id && title.as_str() == "Write tests")
            .returning(|_, list_id, title| {
                Ok(CardSummary {
                    id: Uuid::new_v4(),
                    list_id,
                    title: title.into_string(),
                    has_description: false,
                    description_preview: String::new(),
                    label_ids: Vec::new(),
                    assignee_ids: Vec::new(),
                    due_date: None,
                    comment_count: 0,
                })
            });

        let result = CreateCard::new(Arc::new(repo))
            .execute(Uuid::new_v4(), list_id, "  Write tests  ")
            .await;

        assert_eq!(
            result.expect("creation should succeed").title,
            "Write tests"
        );
    }

    #[tokio::test]
    async fn rejects_a_blank_title() {
        let result = CreateCard::new(Arc::new(MockCardRepo::new()))
            .execute(Uuid::new_v4(), Uuid::new_v4(), "  ")
            .await;

        assert!(matches!(result, Err(BoardsError::Invalid(_))));
    }

    #[tokio::test]
    async fn surfaces_the_card_limit() {
        let mut repo = MockCardRepo::new();
        repo.expect_create()
            .returning(|_, _, _| Err(BoardsError::LimitReached("cards")));

        let result = CreateCard::new(Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4(), "One more")
            .await;

        assert_eq!(result, Err(BoardsError::LimitReached("cards")));
    }
}
