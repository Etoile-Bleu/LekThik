use argon2::Argon2;
use argon2::password_hash::phc::PasswordHash;
use argon2::password_hash::{Error as HashError, PasswordVerifier};
use domain::{User, UserRepo, UserRepoError};

#[derive(Debug, thiserror::Error)]
pub enum LoginUserError {
    #[error("invalid email or password")]
    InvalidCredentials,
    #[error("repository error: {0}")]
    Repository(String),
}

impl From<UserRepoError> for LoginUserError {
    fn from(value: UserRepoError) -> Self {
        match value {
            UserRepoError::Repository(message) => Self::Repository(message),
        }
    }
}

pub struct LoginUser<R: UserRepo> {
    repo: R,
}

impl<R: UserRepo> LoginUser<R> {
    pub fn new(repo: R) -> Self {
        Self { repo }
    }

    pub async fn execute(&self, email: &str, password: &str) -> Result<User, LoginUserError> {
        let Some((user, password_hash)) = self.repo.find_credentials_by_email(email).await? else {
            return Err(LoginUserError::InvalidCredentials);
        };

        verify_password(password, &password_hash)
            .map_err(|_| LoginUserError::InvalidCredentials)?;

        Ok(user)
    }
}

fn verify_password(password: &str, password_hash: &str) -> Result<(), HashError> {
    let parsed_hash = PasswordHash::new(password_hash)?;
    Argon2::default().verify_password(password.as_bytes(), &parsed_hash)
}

#[cfg(test)]
mod tests {
    use domain::MockUserRepo;
    use uuid::Uuid;

    use super::*;
    use crate::user::register::hash_password;

    #[tokio::test]
    async fn logs_in_a_user_with_the_right_password() {
        let password_hash = hash_password("a-strong-password").expect("hashing should succeed");
        let mut mock_repo = MockUserRepo::new();
        mock_repo
            .expect_find_credentials_by_email()
            .times(1)
            .returning(move |_| {
                Ok(Some((
                    User {
                        id: Uuid::new_v4(),
                        email: "person@example.com".to_string(),
                        username: "person".to_string(),
                    },
                    password_hash.clone(),
                )))
            });

        let use_case = LoginUser::new(mock_repo);

        let result = use_case
            .execute("person@example.com", "a-strong-password")
            .await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn rejects_login_with_the_wrong_password() {
        let password_hash = hash_password("a-strong-password").expect("hashing should succeed");
        let mut mock_repo = MockUserRepo::new();
        mock_repo
            .expect_find_credentials_by_email()
            .times(1)
            .returning(move |_| {
                Ok(Some((
                    User {
                        id: Uuid::new_v4(),
                        email: "person@example.com".to_string(),
                        username: "person".to_string(),
                    },
                    password_hash.clone(),
                )))
            });

        let use_case = LoginUser::new(mock_repo);

        let result = use_case
            .execute("person@example.com", "the-wrong-password")
            .await;

        assert!(matches!(result, Err(LoginUserError::InvalidCredentials)));
    }

    #[tokio::test]
    async fn rejects_login_for_an_unknown_email() {
        let mut mock_repo = MockUserRepo::new();
        mock_repo
            .expect_find_credentials_by_email()
            .times(1)
            .returning(|_| Ok(None));

        let use_case = LoginUser::new(mock_repo);

        let result = use_case
            .execute("nobody@example.com", "a-strong-password")
            .await;

        assert!(matches!(result, Err(LoginUserError::InvalidCredentials)));
    }
}
