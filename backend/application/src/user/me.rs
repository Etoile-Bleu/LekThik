use domain::{User, UserRepo, UserRepoError};
use uuid::Uuid;

#[derive(Debug, thiserror::Error)]
pub enum GetCurrentUserError {
    #[error("user not found")]
    NotFound,
    #[error("repository error: {0}")]
    Repository(String),
}

impl From<UserRepoError> for GetCurrentUserError {
    fn from(value: UserRepoError) -> Self {
        match value {
            UserRepoError::Repository(message) => Self::Repository(message),
        }
    }
}

pub struct GetCurrentUser<R: UserRepo> {
    repo: R,
}

impl<R: UserRepo> GetCurrentUser<R> {
    pub fn new(repo: R) -> Self {
        Self { repo }
    }

    pub async fn execute(&self, user_id: Uuid) -> Result<User, GetCurrentUserError> {
        self.repo
            .find_by_id(user_id)
            .await?
            .ok_or(GetCurrentUserError::NotFound)
    }
}

#[cfg(test)]
mod tests {
    use domain::MockUserRepo;

    use super::*;

    #[tokio::test]
    async fn returns_the_user_matching_the_session_id() {
        let user_id = Uuid::new_v4();
        let mut mock_repo = MockUserRepo::new();
        mock_repo.expect_find_by_id().times(1).returning(move |_| {
            Ok(Some(User {
                id: user_id,
                email: "person@example.com".to_string(),
                username: "person".to_string(),
            }))
        });

        let use_case = GetCurrentUser::new(mock_repo);

        let result = use_case.execute(user_id).await;

        assert_eq!(result.expect("lookup should succeed").id, user_id);
    }

    #[tokio::test]
    async fn fails_when_the_session_user_no_longer_exists() {
        let mut mock_repo = MockUserRepo::new();
        mock_repo
            .expect_find_by_id()
            .times(1)
            .returning(|_| Ok(None));

        let use_case = GetCurrentUser::new(mock_repo);

        let result = use_case.execute(Uuid::new_v4()).await;

        assert!(matches!(result, Err(GetCurrentUserError::NotFound)));
    }
}
