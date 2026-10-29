use std::sync::Arc;

use async_trait::async_trait;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct NewUser {
    pub email: String,
    pub username: String,
    pub password_hash: String,
}

#[derive(Debug, Clone)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub username: String,
    pub email_verified: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum CreateUserError {
    #[error("email already registered")]
    EmailAlreadyRegistered,
    #[error("username already taken")]
    UsernameAlreadyTaken,
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
    async fn find_by_email(&self, email: &str) -> Result<Option<User>, UserRepoError>;
    async fn find_credentials_by_email(
        &self,
        email: &str,
    ) -> Result<Option<(User, String)>, UserRepoError>;
    async fn find_by_id(&self, id: Uuid) -> Result<Option<User>, UserRepoError>;
    async fn set_password_hash(&self, id: Uuid, password_hash: &str) -> Result<(), UserRepoError>;
    async fn mark_email_verified(&self, id: Uuid) -> Result<(), UserRepoError>;
    /// The token behind this person's calendar feed, if they ever asked for one.
    async fn calendar_token(&self, id: Uuid) -> Result<Option<String>, UserRepoError>;
    /// Replaces the calendar token, dropping the old one from service at once.
    async fn set_calendar_token(&self, id: Uuid, token: &str) -> Result<(), UserRepoError>;
    /// Turns the feed off: nothing answers for the old token any more.
    async fn clear_calendar_token(&self, id: Uuid) -> Result<(), UserRepoError>;
    /// Who a calendar token belongs to, for the feed itself, which has no session to check.
    async fn find_by_calendar_token(&self, token: &str) -> Result<Option<User>, UserRepoError>;
}

#[async_trait]
impl UserRepo for Arc<dyn UserRepo> {
    async fn create(&self, new_user: NewUser) -> Result<User, CreateUserError> {
        self.as_ref().create(new_user).await
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

    async fn find_by_id(&self, id: Uuid) -> Result<Option<User>, UserRepoError> {
        self.as_ref().find_by_id(id).await
    }

    async fn set_password_hash(&self, id: Uuid, password_hash: &str) -> Result<(), UserRepoError> {
        self.as_ref().set_password_hash(id, password_hash).await
    }

    async fn mark_email_verified(&self, id: Uuid) -> Result<(), UserRepoError> {
        self.as_ref().mark_email_verified(id).await
    }

    async fn calendar_token(&self, id: Uuid) -> Result<Option<String>, UserRepoError> {
        self.as_ref().calendar_token(id).await
    }

    async fn set_calendar_token(&self, id: Uuid, token: &str) -> Result<(), UserRepoError> {
        self.as_ref().set_calendar_token(id, token).await
    }

    async fn clear_calendar_token(&self, id: Uuid) -> Result<(), UserRepoError> {
        self.as_ref().clear_calendar_token(id).await
    }

    async fn find_by_calendar_token(&self, token: &str) -> Result<Option<User>, UserRepoError> {
        self.as_ref().find_by_calendar_token(token).await
    }
}
