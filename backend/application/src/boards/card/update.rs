use std::sync::Arc;

use domain::boards::{BoardsError, Card, CardRepo, CardUpdate, Description, Title};
use uuid::Uuid;

pub struct UpdateCard {
    repo: Arc<dyn CardRepo>,
}

impl UpdateCard {
    pub fn new(repo: Arc<dyn CardRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        id: Uuid,
        title: Option<&str>,
        description: Option<&str>,
    ) -> Result<Card, BoardsError> {
        let update = CardUpdate {
            title: title.map(Title::parse).transpose()?,
            description: description.map(Description::parse).transpose()?,
        };

        self.repo.update(user_id, id, update).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockCardRepo;

    use super::*;

    fn card_with(title: &str, description: &str) -> Card {
        Card {
            id: Uuid::new_v4(),
            list_id: Uuid::new_v4(),
            title: title.to_string(),
            description: description.to_string(),
            label_ids: Vec::new(),
        }
    }

    #[tokio::test]
    async fn passes_only_the_fields_that_were_sent() {
        let mut repo = MockCardRepo::new();
        repo.expect_update()
            .times(1)
            .withf(|_, _, update| {
                update.title.is_none()
                    && update.description.as_ref().map(|d| d.as_str()) == Some("Details")
            })
            .returning(|_, _, _| Ok(card_with("Kept", "Details")));

        let result = UpdateCard::new(Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4(), None, Some("Details  "))
            .await;

        assert_eq!(
            result.expect("update should succeed").description,
            "Details"
        );
    }

    #[tokio::test]
    async fn clearing_the_description_is_allowed() {
        let mut repo = MockCardRepo::new();
        repo.expect_update()
            .withf(|_, _, update| update.description.as_ref().map(|d| d.as_str()) == Some(""))
            .returning(|_, _, _| Ok(card_with("Kept", "")));

        let result = UpdateCard::new(Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4(), None, Some(""))
            .await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn rejects_a_blank_title_before_reaching_the_repository() {
        let result = UpdateCard::new(Arc::new(MockCardRepo::new()))
            .execute(Uuid::new_v4(), Uuid::new_v4(), Some("   "), None)
            .await;

        assert!(matches!(result, Err(BoardsError::Invalid(_))));
    }

    #[tokio::test]
    async fn rejects_an_overlong_description() {
        let result = UpdateCard::new(Arc::new(MockCardRepo::new()))
            .execute(
                Uuid::new_v4(),
                Uuid::new_v4(),
                None,
                Some(&"a".repeat(10_001)),
            )
            .await;

        assert!(matches!(result, Err(BoardsError::Invalid(_))));
    }
}
