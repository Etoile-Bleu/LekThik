use domain::{
    UserRepo, UserRepoError, VerificationCodeRepo, VerificationCodeRepoError, VerificationPurpose,
};

use super::verification_code::{MAX_ATTEMPTS, hash_code, is_well_formed};

#[derive(Debug, thiserror::Error)]
pub enum VerifyEmailError {
    #[error("invalid or expired code")]
    InvalidCode,
    #[error("repository error: {0}")]
    Repository(String),
}

impl From<UserRepoError> for VerifyEmailError {
    fn from(value: UserRepoError) -> Self {
        match value {
            UserRepoError::Repository(message) => Self::Repository(message),
        }
    }
}

impl From<VerificationCodeRepoError> for VerifyEmailError {
    fn from(value: VerificationCodeRepoError) -> Self {
        match value {
            VerificationCodeRepoError::Repository(message) => Self::Repository(message),
        }
    }
}

pub struct VerifyEmail<U: UserRepo, V: VerificationCodeRepo> {
    users: U,
    codes: V,
}

impl<U: UserRepo, V: VerificationCodeRepo> VerifyEmail<U, V> {
    pub fn new(users: U, codes: V) -> Self {
        Self { users, codes }
    }

    pub async fn execute(&self, email: &str, code: &str) -> Result<(), VerifyEmailError> {
        if !is_well_formed(code) {
            return Err(VerifyEmailError::InvalidCode);
        }

        let user = self
            .users
            .find_by_email(email)
            .await?
            .ok_or(VerifyEmailError::InvalidCode)?;

        let purpose = VerificationPurpose::EmailVerification;
        let accepted = self
            .codes
            .consume(
                user.id,
                purpose,
                &hash_code(user.id, purpose, code),
                MAX_ATTEMPTS,
            )
            .await?;

        if !accepted {
            return Err(VerifyEmailError::InvalidCode);
        }

        self.users.mark_email_verified(user.id).await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use domain::{MockUserRepo, MockVerificationCodeRepo, User};
    use uuid::Uuid;

    use super::*;

    fn unverified_user() -> User {
        User {
            id: Uuid::new_v4(),
            email: "person@example.com".to_string(),
            username: "person".to_string(),
            email_verified: false,
        }
    }

    #[tokio::test]
    async fn marks_the_email_verified_when_the_code_is_accepted() {
        let mut users = MockUserRepo::new();
        users
            .expect_find_by_email()
            .returning(|_| Ok(Some(unverified_user())));
        users
            .expect_mark_email_verified()
            .times(1)
            .returning(|_| Ok(()));
        let mut codes = MockVerificationCodeRepo::new();
        codes
            .expect_consume()
            .times(1)
            .withf(|_, purpose, hash, max_attempts| {
                *purpose == VerificationPurpose::EmailVerification
                    && hash.len() == 64
                    && *max_attempts == MAX_ATTEMPTS
            })
            .returning(|_, _, _, _| Ok(true));

        let result = VerifyEmail::new(users, codes)
            .execute("person@example.com", "123456")
            .await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn rejects_a_code_the_repository_does_not_accept() {
        let mut users = MockUserRepo::new();
        users
            .expect_find_by_email()
            .returning(|_| Ok(Some(unverified_user())));
        users.expect_mark_email_verified().never();
        let mut codes = MockVerificationCodeRepo::new();
        codes.expect_consume().returning(|_, _, _, _| Ok(false));

        let result = VerifyEmail::new(users, codes)
            .execute("person@example.com", "123456")
            .await;

        assert!(matches!(result, Err(VerifyEmailError::InvalidCode)));
    }

    #[tokio::test]
    async fn rejects_a_malformed_code_without_touching_the_repositories() {
        let mut users = MockUserRepo::new();
        users.expect_find_by_email().never();
        let mut codes = MockVerificationCodeRepo::new();
        codes.expect_consume().never();

        let result = VerifyEmail::new(users, codes)
            .execute("person@example.com", "12ab")
            .await;

        assert!(matches!(result, Err(VerifyEmailError::InvalidCode)));
    }

    #[tokio::test]
    async fn rejects_an_unknown_email_like_a_wrong_code() {
        let mut users = MockUserRepo::new();
        users.expect_find_by_email().returning(|_| Ok(None));
        let mut codes = MockVerificationCodeRepo::new();
        codes.expect_consume().never();

        let result = VerifyEmail::new(users, codes)
            .execute("nobody@example.com", "123456")
            .await;

        assert!(matches!(result, Err(VerifyEmailError::InvalidCode)));
    }
}
