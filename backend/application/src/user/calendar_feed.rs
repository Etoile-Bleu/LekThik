use std::sync::Arc;

use domain::boards::{AssignedCard, BoardsError, CardRepo};
use domain::{User, UserRepo, UserRepoError};

#[derive(Debug, thiserror::Error)]
pub enum CalendarFeedError {
    #[error("repository error: {0}")]
    Repository(String),
}

impl From<UserRepoError> for CalendarFeedError {
    fn from(value: UserRepoError) -> Self {
        match value {
            UserRepoError::Repository(message) => Self::Repository(message),
        }
    }
}

impl From<BoardsError> for CalendarFeedError {
    fn from(value: BoardsError) -> Self {
        Self::Repository(value.to_string())
    }
}

/// What a calendar feed reader gets back for one token: whose cards they are, and the cards
/// themselves. `None` for a token nobody holds, so the feed can answer with a plain 404.
pub struct GetCalendarFeed {
    user_repo: Arc<dyn UserRepo>,
    card_repo: Arc<dyn CardRepo>,
}

impl GetCalendarFeed {
    pub fn new(user_repo: Arc<dyn UserRepo>, card_repo: Arc<dyn CardRepo>) -> Self {
        Self {
            user_repo,
            card_repo,
        }
    }

    pub async fn execute(
        &self,
        token: &str,
    ) -> Result<Option<(User, Vec<AssignedCard>)>, CalendarFeedError> {
        let Some(user) = self.user_repo.find_by_calendar_token(token).await? else {
            return Ok(None);
        };

        let cards = self.card_repo.assigned_to(user.id).await?;
        Ok(Some((user, cards)))
    }
}

#[cfg(test)]
mod tests {
    use domain::MockUserRepo;
    use domain::boards::MockCardRepo;
    use uuid::Uuid;

    use super::*;

    fn some_user(id: Uuid) -> User {
        User {
            id,
            email: "person@example.com".to_string(),
            username: "person".to_string(),
            email_verified: true,
        }
    }

    #[tokio::test]
    async fn is_none_for_a_token_nobody_holds() {
        let mut user_repo = MockUserRepo::new();
        user_repo
            .expect_find_by_calendar_token()
            .times(1)
            .returning(|_| Ok(None));
        let card_repo = MockCardRepo::new();

        let result = GetCalendarFeed::new(Arc::new(user_repo), Arc::new(card_repo))
            .execute("nope")
            .await
            .expect("lookup should succeed");

        assert!(result.is_none());
    }

    #[tokio::test]
    async fn returns_the_owner_and_their_assigned_cards() {
        let user_id = Uuid::new_v4();
        let mut user_repo = MockUserRepo::new();
        user_repo
            .expect_find_by_calendar_token()
            .times(1)
            .returning(move |_| Ok(Some(some_user(user_id))));
        let mut card_repo = MockCardRepo::new();
        card_repo
            .expect_assigned_to()
            .times(1)
            .withf(move |id| *id == user_id)
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

        let (user, cards) = GetCalendarFeed::new(Arc::new(user_repo), Arc::new(card_repo))
            .execute("some-token")
            .await
            .expect("lookup should succeed")
            .expect("a user should be found");

        assert_eq!(user.id, user_id);
        assert_eq!(cards.len(), 1);
    }
}
