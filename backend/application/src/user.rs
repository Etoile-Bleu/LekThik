use argon2::Argon2;
use argon2::password_hash::phc::PasswordHash;
use argon2::password_hash::{Error as HashError, PasswordHasher, PasswordVerifier};
use domain::{ConfirmUserError, CreateUserError, NewUser, User, UserRepo, UserRepoError};
use uuid::Uuid;

#[derive(Debug, thiserror::Error)]
pub enum RegisterUserError {
    #[error("email already registered")]
    EmailAlreadyRegistered,
    #[error("failed to hash password")]
    HashingFailed,
    #[error("repository error: {0}")]
    Repository(String),
}

impl From<CreateUserError> for RegisterUserError {
    fn from(value: CreateUserError) -> Self {
        match value {
            CreateUserError::EmailAlreadyRegistered => Self::EmailAlreadyRegistered,
            CreateUserError::Repository(message) => Self::Repository(message),
        }
    }
}

pub struct RegisteredUser {
    pub id: Uuid,
    pub email: String,
    pub confirmation_token: Uuid,
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
        password: &str,
    ) -> Result<RegisteredUser, RegisterUserError> {
        let password_hash =
            hash_password(password).map_err(|_| RegisterUserError::HashingFailed)?;
        let confirmation_token = Uuid::new_v4();

        let user = self
            .repo
            .create(NewUser {
                email,
                password_hash,
                confirmation_token,
            })
            .await?;

        Ok(RegisteredUser {
            id: user.id,
            email: user.email,
            confirmation_token,
        })
    }
}

pub struct ConfirmUser<R: UserRepo> {
    repo: R,
}

impl<R: UserRepo> ConfirmUser<R> {
    pub fn new(repo: R) -> Self {
        Self { repo }
    }

    pub async fn execute(&self, token: Uuid) -> Result<User, ConfirmUserError> {
        self.repo.confirm(token).await
    }
}

fn hash_password(password: &str) -> Result<String, HashError> {
    let argon2 = Argon2::default();
    Ok(argon2.hash_password(password.as_bytes())?.to_string())
}

#[derive(Debug, thiserror::Error)]
pub enum LoginUserError {
    #[error("invalid email or password")]
    InvalidCredentials,
    #[error("email not confirmed")]
    EmailNotConfirmed,
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

        if !user.confirmed {
            return Err(LoginUserError::EmailNotConfirmed);
        }

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

    use super::*;

    #[tokio::test]
    async fn registers_a_user_and_returns_its_confirmation_token() {
        let mut mock_repo = MockUserRepo::new();
        mock_repo.expect_create().times(1).returning(|new_user| {
            Ok(User {
                id: Uuid::new_v4(),
                email: new_user.email,
                confirmed: false,
            })
        });

        let use_case = RegisterUser::new(mock_repo);

        let result = use_case
            .execute("person@example.com".to_string(), "a-strong-password")
            .await;

        let registered = result.expect("registration should succeed");
        assert_eq!(registered.email, "person@example.com");
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
            .execute("person@example.com".to_string(), "a-strong-password")
            .await;

        assert!(matches!(
            result,
            Err(RegisterUserError::EmailAlreadyRegistered)
        ));
    }

    #[tokio::test]
    async fn confirms_a_user_by_token() {
        let token = Uuid::new_v4();
        let mut mock_repo = MockUserRepo::new();
        mock_repo.expect_confirm().times(1).returning(move |_| {
            Ok(User {
                id: Uuid::new_v4(),
                email: "person@example.com".to_string(),
                confirmed: true,
            })
        });

        let use_case = ConfirmUser::new(mock_repo);

        let result = use_case.execute(token).await;

        let user = result.expect("confirmation should succeed");
        assert!(user.confirmed);
    }

    #[tokio::test]
    async fn fails_when_confirmation_token_not_found() {
        let mut mock_repo = MockUserRepo::new();
        mock_repo
            .expect_confirm()
            .times(1)
            .returning(|_| Err(ConfirmUserError::TokenNotFound));

        let use_case = ConfirmUser::new(mock_repo);

        let result = use_case.execute(Uuid::new_v4()).await;

        assert!(matches!(result, Err(ConfirmUserError::TokenNotFound)));
    }

    #[tokio::test]
    async fn logs_in_a_confirmed_user_with_the_right_password() {
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
                        confirmed: true,
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
                        confirmed: true,
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
    async fn rejects_login_for_an_unconfirmed_email() {
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
                        confirmed: false,
                    },
                    password_hash.clone(),
                )))
            });

        let use_case = LoginUser::new(mock_repo);

        let result = use_case
            .execute("person@example.com", "a-strong-password")
            .await;

        assert!(matches!(result, Err(LoginUserError::EmailNotConfirmed)));
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
