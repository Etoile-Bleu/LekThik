use std::sync::Arc;

use async_trait::async_trait;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct NewUser {
    pub email: String,
    pub password_hash: String,
    pub confirmation_token: Uuid,
}

#[derive(Debug, Clone)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub confirmed: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum CreateUserError {
    #[error("email already registered")]
    EmailAlreadyRegistered,
    #[error("repository error: {0}")]
    Repository(String),
}

#[derive(Debug, thiserror::Error)]
pub enum ConfirmUserError {
    #[error("confirmation token not found")]
    TokenNotFound,
    #[error("repository error: {0}")]
    Repository(String),
}

#[derive(Debug, thiserror::Error)]
pub enum UserRepoError {
    #[error("repository error: {0}")]
    Repository(String),
}

#[cfg_attr(feature = "test-utils", mockall::automock)]
#[async_trait]
pub trait UserRepo: Send + Sync {
    async fn create(&self, new_user: NewUser) -> Result<User, CreateUserError>;
    async fn confirm(&self, token: Uuid) -> Result<User, ConfirmUserError>;
    async fn find_by_email(&self, email: &str) -> Result<Option<User>, UserRepoError>;
    async fn find_credentials_by_email(
        &self,
        email: &str,
    ) -> Result<Option<(User, String)>, UserRepoError>;
}

#[async_trait]
impl UserRepo for Arc<dyn UserRepo> {
    async fn create(&self, new_user: NewUser) -> Result<User, CreateUserError> {
        self.as_ref().create(new_user).await
    }

    async fn confirm(&self, token: Uuid) -> Result<User, ConfirmUserError> {
        self.as_ref().confirm(token).await
    }

    async fn find_by_email(&self, email: &str) -> Result<Option<User>, UserRepoError> {
        self.as_ref().find_by_email(email).await
    }

    async fn find_credentials_by_email(
        &self,
        email: &str,
    ) -> Result<Option<(User, String)>, UserRepoError> {
        self.as_ref().find_credentials_by_email(email).await
    }
}
