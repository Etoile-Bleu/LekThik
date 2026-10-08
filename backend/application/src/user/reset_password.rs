use domain::{
    UserRepo, UserRepoError, VerificationCodeRepo, VerificationCodeRepoError, VerificationPurpose,
};

use super::register::hash_password;
use super::verification_code::{MAX_ATTEMPTS, hash_code, is_well_formed};

#[derive(Debug, thiserror::Error)]
pub enum ResetPasswordError {
    #[error("invalid or expired code")]
    InvalidCode,
    #[error("failed to hash password")]
    HashingFailed,
    #[error("repository error: {0}")]
    Repository(String),
}

impl From<UserRepoError> for ResetPasswordError {
    fn from(value: UserRepoError) -> Self {
        match value {
            UserRepoError::Repository(message) => Self::Repository(message),
        }
    }
}

impl From<VerificationCodeRepoError> for ResetPasswordError {
    fn from(value: VerificationCodeRepoError) -> Self {
        match value {
            VerificationCodeRepoError::Repository(message) => Self::Repository(message),
        }
    }
}

pub struct ResetPassword<U: UserRepo, V: VerificationCodeRepo> {
    users: U,
    codes: V,
}

impl<U: UserRepo, V: VerificationCodeRepo> ResetPassword<U, V> {
    pub fn new(users: U, codes: V) -> Self {
        Self { users, codes }
    }

    pub async fn execute(
        &self,
        email: &str,
        code: &str,
        new_password: &str,
    ) -> Result<(), ResetPasswordError> {
        if !is_well_formed(code) {
            return Err(ResetPasswordError::InvalidCode);
        }

        let user = self
            .users
            .find_by_email(email)
            .await?
            .ok_or(ResetPasswordError::InvalidCode)?;

        let password_hash =
            hash_password(new_password).map_err(|_| ResetPasswordError::HashingFailed)?;

        let purpose = VerificationPurpose::PasswordReset;
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
            return Err(ResetPasswordError::InvalidCode);
        }

        self.users
            .set_password_hash(user.id, &password_hash)
            .await?;

        if !user.email_verified {
            self.users.mark_email_verified(user.id).await?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use domain::{MockUserRepo, MockVerificationCodeRepo, User};
    use uuid::Uuid;

    use super::*;

    fn user(email_verified: bool) -> User {
        User {
            id: Uuid::new_v4(),
            email: "person@example.com".to_string(),
            username: "person".to_string(),
            email_verified,
        }
    }

    #[tokio::test]
    async fn stores_a_new_password_hash_when_the_code_is_accepted() {
        let mut users = MockUserRepo::new();
        users
            .expect_find_by_email()
            .returning(|_| Ok(Some(user(true))));
        users
            .expect_set_password_hash()
            .times(1)
            .withf(|_, hash| hash.starts_with("$argon2"))
            .returning(|_, _| Ok(()));
        users.expect_mark_email_verified().never();
        let mut codes = MockVerificationCodeRepo::new();
        codes
            .expect_consume()
            .times(1)
            .withf(|_, purpose, _, _| *purpose == VerificationPurpose::PasswordReset)
            .returning(|_, _, _, _| Ok(true));

        let result = ResetPassword::new(users, codes)
            .execute("person@example.com", "123456", "a-new-strong-password")
            .await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn also_verifies_the_email_of_an_unverified_user() {
        let mut users = MockUserRepo::new();
        users
            .expect_find_by_email()
            .returning(|_| Ok(Some(user(false))));
        users.expect_set_password_hash().returning(|_, _| Ok(()));
        users
            .expect_mark_email_verified()
            .times(1)
            .returning(|_| Ok(()));
        let mut codes = MockVerificationCodeRepo::new();
        codes.expect_consume().returning(|_, _, _, _| Ok(true));

        let result = ResetPassword::new(users, codes)
            .execute("person@example.com", "123456", "a-new-strong-password")
            .await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn keeps_the_old_password_when_the_code_is_rejected() {
        let mut users = MockUserRepo::new();
        users
            .expect_find_by_email()
            .returning(|_| Ok(Some(user(true))));
        users.expect_set_password_hash().never();
        let mut codes = MockVerificationCodeRepo::new();
        codes.expect_consume().returning(|_, _, _, _| Ok(false));

        let result = ResetPassword::new(users, codes)
            .execute("person@example.com", "123456", "a-new-strong-password")
            .await;

        assert!(matches!(result, Err(ResetPasswordError::InvalidCode)));
    }

    #[tokio::test]
    async fn rejects_an_unknown_email_like_a_wrong_code() {
        let mut users = MockUserRepo::new();
        users.expect_find_by_email().returning(|_| Ok(None));
        let mut codes = MockVerificationCodeRepo::new();
        codes.expect_consume().never();

        let result = ResetPassword::new(users, codes)
            .execute("nobody@example.com", "123456", "a-new-strong-password")
            .await;

        assert!(matches!(result, Err(ResetPasswordError::InvalidCode)));
    }
}
