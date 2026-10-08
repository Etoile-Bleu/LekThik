use domain::{
    Mailer, MailerError, UserRepoError, VerificationCodeRepo, VerificationCodeRepoError,
    VerificationPurpose,
};
use uuid::Uuid;

use super::code_email::build_code_email;
use super::verification_code::{CODE_TTL_SECONDS, generate_code, hash_code};

#[derive(Debug, thiserror::Error)]
pub enum IssueVerificationCodeError {
    #[error("repository error: {0}")]
    Repository(String),
    #[error("mailer error: {0}")]
    Mailer(String),
}

impl From<VerificationCodeRepoError> for IssueVerificationCodeError {
    fn from(value: VerificationCodeRepoError) -> Self {
        match value {
            VerificationCodeRepoError::Repository(message) => Self::Repository(message),
        }
    }
}

impl From<UserRepoError> for IssueVerificationCodeError {
    fn from(value: UserRepoError) -> Self {
        match value {
            UserRepoError::Repository(message) => Self::Repository(message),
        }
    }
}

impl From<MailerError> for IssueVerificationCodeError {
    fn from(value: MailerError) -> Self {
        match value {
            MailerError::Delivery(message) => Self::Mailer(message),
        }
    }
}

pub struct IssueVerificationCode<V: VerificationCodeRepo, M: Mailer> {
    codes: V,
    mailer: M,
}

impl<V: VerificationCodeRepo, M: Mailer> IssueVerificationCode<V, M> {
    pub fn new(codes: V, mailer: M) -> Self {
        Self { codes, mailer }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        email: &str,
        username: &str,
        purpose: VerificationPurpose,
    ) -> Result<(), IssueVerificationCodeError> {
        let code = generate_code();

        self.codes
            .store(
                user_id,
                purpose,
                &hash_code(user_id, purpose, &code),
                CODE_TTL_SECONDS,
            )
            .await?;

        self.mailer
            .send(build_code_email(purpose, email, username, &code))
            .await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use domain::{MockMailer, MockVerificationCodeRepo};

    use super::*;

    #[tokio::test]
    async fn stores_a_hashed_code_and_emails_the_plain_code() {
        let user_id = Uuid::new_v4();
        let mut codes = MockVerificationCodeRepo::new();
        codes
            .expect_store()
            .times(1)
            .withf(move |id, purpose, hash, ttl| {
                *id == user_id
                    && *purpose == VerificationPurpose::EmailVerification
                    && hash.len() == 64
                    && *ttl == CODE_TTL_SECONDS
            })
            .returning(|_, _, _, _| Ok(()));
        let mut mailer = MockMailer::new();
        mailer
            .expect_send()
            .times(1)
            .withf(|message| {
                message.to == "person@example.com"
                    && message.text_body.lines().any(|line| {
                        line.strip_prefix("Your code: ")
                            .is_some_and(|code| code.len() == 6)
                    })
            })
            .returning(|_| Ok(()));

        let result = IssueVerificationCode::new(codes, mailer)
            .execute(
                user_id,
                "person@example.com",
                "person",
                VerificationPurpose::EmailVerification,
            )
            .await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn does_not_send_an_email_when_storing_the_code_fails() {
        let mut codes = MockVerificationCodeRepo::new();
        codes
            .expect_store()
            .times(1)
            .returning(|_, _, _, _| Err(VerificationCodeRepoError::Repository("down".to_string())));
        let mut mailer = MockMailer::new();
        mailer.expect_send().never();

        let result = IssueVerificationCode::new(codes, mailer)
            .execute(
                Uuid::new_v4(),
                "person@example.com",
                "person",
                VerificationPurpose::PasswordReset,
            )
            .await;

        assert!(matches!(
            result,
            Err(IssueVerificationCodeError::Repository(_))
        ));
    }

    #[tokio::test]
    async fn reports_a_mailer_failure() {
        let mut codes = MockVerificationCodeRepo::new();
        codes.expect_store().returning(|_, _, _, _| Ok(()));
        let mut mailer = MockMailer::new();
        mailer
            .expect_send()
            .returning(|_| Err(MailerError::Delivery("rejected".to_string())));

        let result = IssueVerificationCode::new(codes, mailer)
            .execute(
                Uuid::new_v4(),
                "person@example.com",
                "person",
                VerificationPurpose::PasswordReset,
            )
            .await;

        assert!(matches!(result, Err(IssueVerificationCodeError::Mailer(_))));
    }
}
