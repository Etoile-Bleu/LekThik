use argon2::Argon2;
use argon2::password_hash::{Error as HashError, PasswordHasher};
use domain::{CreateUserError, NewUser, UserRepo};
use uuid::Uuid;

#[derive(Debug, thiserror::Error)]
pub enum RegisterUserError {
    #[error("email already registered")]
    EmailAlreadyRegistered,
    #[error("username already taken")]
    UsernameAlreadyTaken,
    #[error("failed to hash password")]
    HashingFailed,
    #[error("repository error: {0}")]
    Repository(String),
}

impl From<CreateUserError> for RegisterUserError {
    fn from(value: CreateUserError) -> Self {
        match value {
            CreateUserError::EmailAlreadyRegistered => Self::EmailAlreadyRegistered,
            CreateUserError::UsernameAlreadyTaken => Self::UsernameAlreadyTaken,
            CreateUserError::Repository(message) => Self::Repository(message),
        }
    }
}

pub struct RegisteredUser {
    pub id: Uuid,
    pub email: String,
    pub username: String,
}

pub struct RegisterUser<R: UserRepo> {
    repo: R,
}

impl<R: UserRepo> RegisterUser<R> {
    pub fn new(repo: R) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        email: String,
        username: String,
        password: &str,
    ) -> Result<RegisteredUser, RegisterUserError> {
        let password_hash =
            hash_password(password).map_err(|_| RegisterUserError::HashingFailed)?;

        let user = self
            .repo
            .create(NewUser {
                email,
                username,
                password_hash,
            })
            .await?;

        Ok(RegisteredUser {
            id: user.id,
            email: user.email,
            username: user.username,
        })
    }
}

pub(crate) fn hash_password(password: &str) -> Result<String, HashError> {
    let argon2 = Argon2::default();
    Ok(argon2.hash_password(password.as_bytes())?.to_string())
}

#[cfg(test)]
mod tests {
    use domain::{MockUserRepo, User};

    use super::*;

    #[tokio::test]
    async fn registers_a_user_and_returns_it() {
        let mut mock_repo = MockUserRepo::new();
        mock_repo.expect_create().times(1).returning(|new_user| {
            Ok(User {
                id: Uuid::new_v4(),
                email: new_user.email,
                username: new_user.username,
            })
        });

        let use_case = RegisterUser::new(mock_repo);

        let result = use_case
            .execute(
                "person@example.com".to_string(),
                "person".to_string(),
                "a-strong-password",
            )
            .await;

        let registered = result.expect("registration should succeed");
        assert_eq!(registered.email, "person@example.com");
        assert_eq!(registered.username, "person");
    }

    #[tokio::test]
    async fn fails_when_email_already_registered() {
        let mut mock_repo = MockUserRepo::new();
        mock_repo
            .expect_create()
            .times(1)
            .returning(|_| Err(CreateUserError::EmailAlreadyRegistered));

        let use_case = RegisterUser::new(mock_repo);

        let result = use_case
            .execute(
                "person@example.com".to_string(),
                "person".to_string(),
                "a-strong-password",
            )
            .await;

        assert!(matches!(
            result,
            Err(RegisterUserError::EmailAlreadyRegistered)
        ));
    }

    #[tokio::test]
    async fn fails_when_username_already_taken() {
        let mut mock_repo = MockUserRepo::new();
        mock_repo
            .expect_create()
            .times(1)
            .returning(|_| Err(CreateUserError::UsernameAlreadyTaken));

        let use_case = RegisterUser::new(mock_repo);

        let result = use_case
            .execute(
                "person@example.com".to_string(),
                "person".to_string(),
                "a-strong-password",
            )
            .await;

        assert!(matches!(
            result,
            Err(RegisterUserError::UsernameAlreadyTaken)
        ));
    }
}
