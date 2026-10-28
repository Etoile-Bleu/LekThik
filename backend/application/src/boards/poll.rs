use std::sync::Arc;

use domain::boards::{BoardsError, PollRepo};
use uuid::Uuid;

pub struct VoteInPoll {
    repo: Arc<dyn PollRepo>,
}

impl VoteInPoll {
    pub fn new(repo: Arc<dyn PollRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        list_id: Uuid,
        option_id: &str,
    ) -> Result<(), BoardsError> {
        self.repo.vote(user_id, list_id, option_id.trim()).await
    }
}

pub struct WithdrawVote {
    repo: Arc<dyn PollRepo>,
}

impl WithdrawVote {
    pub fn new(repo: Arc<dyn PollRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(&self, user_id: Uuid, list_id: Uuid) -> Result<(), BoardsError> {
        self.repo.withdraw(user_id, list_id).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockPollRepo;
    use mockall::predicate::eq;

    use super::*;

    #[tokio::test]
    async fn a_vote_is_passed_on_with_its_option_trimmed() {
        let user = Uuid::new_v4();
        let list = Uuid::new_v4();
        let mut repo = MockPollRepo::new();
        repo.expect_vote()
            .with(eq(user), eq(list), eq("a1"))
            .once()
            .returning(|_, _, _| Ok(()));

        let result = VoteInPoll::new(Arc::new(repo))
            .execute(user, list, " a1 ")
            .await;

        assert_eq!(result, Ok(()));
    }

    #[tokio::test]
    async fn withdrawing_goes_to_the_repository() {
        let user = Uuid::new_v4();
        let list = Uuid::new_v4();
        let mut repo = MockPollRepo::new();
        repo.expect_withdraw()
            .with(eq(user), eq(list))
            .once()
            .returning(|_, _| Err(BoardsError::NotFound));

        let result = WithdrawVote::new(Arc::new(repo)).execute(user, list).await;

        assert_eq!(result, Err(BoardsError::NotFound));
    }
}
