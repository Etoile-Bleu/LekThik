use std::sync::Arc;

use domain::{UserRepo, UserRepoError};
use uuid::Uuid;

/// Two random identifiers end to end: 256 bits, the same source of randomness the email
/// verification code already draws on, with nothing to guess and nothing to brute force.
fn generate_token() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

/// Whether the feed is already on, and its address if so. Never makes one: opening the settings
/// page must never be the thing that turns sharing on, only pressing the switch does that.
pub struct GetCalendarToken {
    repo: Arc<dyn UserRepo>,
}

impl GetCalendarToken {
    pub fn new(repo: Arc<dyn UserRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(&self, user_id: Uuid) -> Result<Option<String>, UserRepoError> {
        self.repo.calendar_token(user_id).await
    }
}

/// A fresh token, replacing whichever one came before: the old feed address stops answering at
/// once. The same call turns the feed on for the first time and swaps it out for someone who
/// thinks their link got out.
pub struct RegenerateCalendarToken {
    repo: Arc<dyn UserRepo>,
}

impl RegenerateCalendarToken {
    pub fn new(repo: Arc<dyn UserRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(&self, user_id: Uuid) -> Result<String, UserRepoError> {
        let token = generate_token();
        self.repo.set_calendar_token(user_id, &token).await?;
        Ok(token)
    }
}

/// Turns the feed off. Whoever held the old link gets a plain 404 from then on.
pub struct RevokeCalendarToken {
    repo: Arc<dyn UserRepo>,
}

impl RevokeCalendarToken {
    pub fn new(repo: Arc<dyn UserRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(&self, user_id: Uuid) -> Result<(), UserRepoError> {
        self.repo.clear_calendar_token(user_id).await
    }
}

#[cfg(test)]
mod tests {
    use domain::MockUserRepo;

    use super::*;

    #[tokio::test]
    async fn is_none_for_someone_who_never_turned_the_feed_on() {
        let mut repo = MockUserRepo::new();
        repo.expect_calendar_token()
            .times(1)
            .returning(|_| Ok(None));

        let token = GetCalendarToken::new(Arc::new(repo))
            .execute(Uuid::new_v4())
            .await
            .expect("lookup should succeed");

        assert!(token.is_none());
    }

    #[tokio::test]
    async fn gives_back_the_existing_token_without_writing_anything() {
        let mut repo = MockUserRepo::new();
        repo.expect_calendar_token()
            .times(1)
            .returning(|_| Ok(Some("existing-token".to_string())));
        repo.expect_set_calendar_token().times(0);

        let token = GetCalendarToken::new(Arc::new(repo))
            .execute(Uuid::new_v4())
            .await
            .expect("lookup should succeed");

        assert_eq!(token.as_deref(), Some("existing-token"));
    }

    #[tokio::test]
    async fn regenerating_always_writes_a_new_one() {
        let mut repo = MockUserRepo::new();
        repo.expect_set_calendar_token()
            .times(1)
            .returning(|_, _| Ok(()));

        let token = RegenerateCalendarToken::new(Arc::new(repo))
            .execute(Uuid::new_v4())
            .await
            .expect("token");

        assert_eq!(token.len(), 64);
    }

    #[tokio::test]
    async fn revoking_clears_it() {
        let mut repo = MockUserRepo::new();
        repo.expect_clear_calendar_token()
            .times(1)
            .returning(|_| Ok(()));

        RevokeCalendarToken::new(Arc::new(repo))
            .execute(Uuid::new_v4())
            .await
            .expect("revoked");
    }
}
