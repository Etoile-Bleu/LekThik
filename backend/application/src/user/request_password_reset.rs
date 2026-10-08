use domain::{Mailer, UserRepo, VerificationCodeRepo, VerificationPurpose};

use super::issue_verification_code::{IssueVerificationCode, IssueVerificationCodeError};

pub struct RequestPasswordReset<U: UserRepo, V: VerificationCodeRepo, M: Mailer> {
    users: U,
    issue_code: IssueVerificationCode<V, M>,
}

impl<U: UserRepo, V: VerificationCodeRepo, M: Mailer> RequestPasswordReset<U, V, M> {
    pub fn new(users: U, codes: V, mailer: M) -> Self {
        Self {
            users,
            issue_code: IssueVerificationCode::new(codes, mailer),
        }
    }

    pub async fn execute(&self, email: &str) -> Result<(), IssueVerificationCodeError> {
        let Some(user) = self.users.find_by_email(email).await? else {
            return Ok(());
        };

        self.issue_code
            .execute(
                user.id,
                &user.email,
                &user.username,
                VerificationPurpose::PasswordReset,
            )
            .await
    }
}

#[cfg(test)]
mod tests {
    use domain::{MockMailer, MockUserRepo, MockVerificationCodeRepo, User};
    use uuid::Uuid;

    use super::*;

    #[tokio::test]
    async fn sends_a_reset_code_to_a_known_user() {
        let mut users = MockUserRepo::new();
        users.expect_find_by_email().returning(|_| {
            Ok(Some(User {
                id: Uuid::new_v4(),
                email: "person@example.com".to_string(),
                username: "person".to_string(),
                email_verified: true,
            }))
        });
        let mut codes = MockVerificationCodeRepo::new();
        codes
            .expect_store()
            .times(1)
            .withf(|_, purpose, _, _| *purpose == VerificationPurpose::PasswordReset)
            .returning(|_, _, _, _| Ok(()));
        let mut mailer = MockMailer::new();
        mailer
            .expect_send()
            .times(1)
            .withf(|message| message.subject == "Reset your LekThik password")
            .returning(|_| Ok(()));

        let result = RequestPasswordReset::new(users, codes, mailer)
            .execute("person@example.com")
            .await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn does_nothing_for_an_unknown_email() {
        let mut users = MockUserRepo::new();
        users.expect_find_by_email().returning(|_| Ok(None));
        let mut codes = MockVerificationCodeRepo::new();
        codes.expect_store().never();
        let mut mailer = MockMailer::new();
        mailer.expect_send().never();

        let result = RequestPasswordReset::new(users, codes, mailer)
            .execute("nobody@example.com")
            .await;

        assert!(result.is_ok());
    }
}
