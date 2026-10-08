use std::sync::Arc;

use async_trait::async_trait;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VerificationPurpose {
    EmailVerification,
    PasswordReset,
}

#[derive(Debug, thiserror::Error)]
pub enum VerificationCodeRepoError {
    #[error("repository error: {0}")]
    Repository(String),
}

#[cfg_attr(feature = "test-utils", mockall::automock)]
#[async_trait]
pub trait VerificationCodeRepo: Send + Sync {
    async fn store(
        &self,
        user_id: Uuid,
        purpose: VerificationPurpose,
        code_hash: &str,
        ttl_seconds: i64,
    ) -> Result<(), VerificationCodeRepoError>;

    async fn consume(
        &self,
        user_id: Uuid,
        purpose: VerificationPurpose,
        code_hash: &str,
        max_attempts: i32,
    ) -> Result<bool, VerificationCodeRepoError>;
}

#[async_trait]
impl VerificationCodeRepo for Arc<dyn VerificationCodeRepo> {
    async fn store(
        &self,
        user_id: Uuid,
        purpose: VerificationPurpose,
        code_hash: &str,
        ttl_seconds: i64,
    ) -> Result<(), VerificationCodeRepoError> {
        self.as_ref()
            .store(user_id, purpose, code_hash, ttl_seconds)
            .await
    }

    async fn consume(
        &self,
        user_id: Uuid,
        purpose: VerificationPurpose,
        code_hash: &str,
        max_attempts: i32,
    ) -> Result<bool, VerificationCodeRepoError> {
        self.as_ref()
            .consume(user_id, purpose, code_hash, max_attempts)
            .await
    }
}
