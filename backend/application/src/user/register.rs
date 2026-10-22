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
        username: Option<String>,
        password: &str,
    ) -> Result<RegisteredUser, RegisterUserError> {
        let password_hash =
            hash_password(password).map_err(|_| RegisterUserError::HashingFailed)?;

        let user = match username {
            Some(username) => {
                self.repo
                    .create(NewUser {
                        email,
                        username,
                        password_hash,
                    })
                    .await?
            }
            None => {
                self.create_with_generated_username(email, password_hash)
                    .await?
            }
        };

        Ok(RegisteredUser {
            id: user.id,
            email: user.email,
            username: user.username,
        })
    }
}

impl<R: UserRepo> RegisterUser<R> {
    /// Signing up only asks for an email and a password, so the display name
    /// comes from the address and gets a short suffix when it is already taken.
    async fn create_with_generated_username(
        &self,
        email: String,
        password_hash: String,
    ) -> Result<domain::User, RegisterUserError> {
        let base = username_base(&email);

        for attempt in 0..GENERATED_USERNAME_ATTEMPTS {
            let username = if attempt == 0 {
                base.clone()
            } else {
                with_suffix(&base)
            };

            match self
                .repo
                .create(NewUser {
                    email: email.clone(),
                    username,
                    password_hash: password_hash.clone(),
                })
                .await
            {
                Err(CreateUserError::UsernameAlreadyTaken) => continue,
                other => return other.map_err(Into::into),
            }
        }

        Err(RegisterUserError::UsernameAlreadyTaken)
    }
}

const GENERATED_USERNAME_ATTEMPTS: usize = 6;
const USERNAME_BASE_MAX: usize = 24;

fn username_base(email: &str) -> String {
    let local = email.split('@').next().unwrap_or_default();
    let mut base: String = local
        .chars()
        .filter(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        })
        .take(USERNAME_BASE_MAX)
        .collect();
    while base.len() < 3 {
        base.push('x');
    }

    base
}

fn with_suffix(base: &str) -> String {
    let suffix = Uuid::new_v4().simple().to_string();
    format!("{base}-{}", &suffix[..4])
}

pub(crate) fn hash_password(password: &str) -> Result<String, HashError> {
    let argon2 = Argon2::default();
    Ok(argon2.hash_password(password.as_bytes())?.to_string())
}

#[cfg(test)]
mod tests {
    use domain::{MockUserRepo, User};

    use super::*;

    #[test]
    fn derives_a_valid_username_from_the_email() {
        assert_eq!(
            username_base("marie.dupont+news@example.com"),
            "marie.dupontnews"
        );
        assert_eq!(username_base("a@example.com"), "axx");
        assert_eq!(
            username_base(&format!("{}@example.com", "z".repeat(40))).len(),
            24
        );
    }

    #[tokio::test]
    async fn generates_a_username_and_retries_when_it_is_taken() {
        let mut mock_repo = MockUserRepo::new();
        let mut calls = 0;
        mock_repo
            .expect_create()
            .times(2)
            .returning(move |new_user| {
                calls += 1;
                if calls == 1 {
                    return Err(CreateUserError::UsernameAlreadyTaken);
                }
                Ok(User {
                    id: Uuid::new_v4(),
                    email: new_user.email,
                    username: new_user.username,
                    email_verified: false,
                })
            });

        let registered = RegisterUser::new(mock_repo)
            .execute("marie@example.com".to_string(), None, "a-strong-password")
            .await
            .expect("registration should succeed");

        assert!(registered.username.starts_with("marie-"));
    }

    #[tokio::test]
    async fn registers_a_user_and_returns_it() {
        let mut mock_repo = MockUserRepo::new();
        mock_repo.expect_create().times(1).returning(|new_user| {
            Ok(User {
                id: Uuid::new_v4(),
                email: new_user.email,
                username: new_user.username,
                email_verified: false,
            })
        });

        let use_case = RegisterUser::new(mock_repo);

        let result = use_case
            .execute(
                "person@example.com".to_string(),
                Some("person".to_string()),
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
                Some("person".to_string()),
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
                Some("person".to_string()),
                "a-strong-password",
            )
            .await;

        assert!(matches!(
            result,
            Err(RegisterUserError::UsernameAlreadyTaken)
        ));
    }
}
