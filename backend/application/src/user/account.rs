use std::sync::Arc;

use domain::{AccountError, AccountExport, AccountRepo, UserRepo};
use uuid::Uuid;

use super::login::verify_password;

pub struct ExportAccount {
    repo: Arc<dyn AccountRepo>,
}

impl ExportAccount {
    pub fn new(repo: Arc<dyn AccountRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(&self, user_id: Uuid) -> Result<AccountExport, AccountError> {
        self.repo.export(user_id).await
    }
}

pub struct DeleteAccount {
    users: Arc<dyn UserRepo>,
    accounts: Arc<dyn AccountRepo>,
}

impl DeleteAccount {
    pub fn new(users: Arc<dyn UserRepo>, accounts: Arc<dyn AccountRepo>) -> Self {
        Self { users, accounts }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        password: &str,
        confirmation: &str,
        delete_owned_workspaces: bool,
    ) -> Result<(), AccountError> {
        let repository = |error: domain::UserRepoError| AccountError::Repository(error.to_string());
        let user = self
            .users
            .find_by_id(user_id)
            .await
            .map_err(repository)?
            .ok_or(AccountError::NotFound)?;

        if confirmation.trim() != user.username {
            return Err(AccountError::Invalid(
                "type your username exactly to confirm".to_string(),
            ));
        }

        let (_, password_hash) = self
            .users
            .find_credentials_by_email(&user.email)
            .await
            .map_err(repository)?
            .ok_or(AccountError::NotFound)?;
        verify_password(password, &password_hash).map_err(|_| AccountError::WrongPassword)?;

        self.accounts.delete(user_id, delete_owned_workspaces).await
    }
}

#[cfg(test)]
mod tests {
    use domain::{MockAccountRepo, MockUserRepo, OwnedWorkspace, User};

    use super::*;
    use crate::user::register::hash_password;

    fn person(id: Uuid) -> User {
        User {
            id,
            email: "person@example.com".to_string(),
            username: "person".to_string(),
            email_verified: true,
        }
    }

    fn users_with(id: Uuid, password: &str) -> MockUserRepo {
        let hash = hash_password(password).expect("hashing should succeed");
        let mut users = MockUserRepo::new();
        users
            .expect_find_by_id()
            .returning(move |_| Ok(Some(person(id))));
        users
            .expect_find_credentials_by_email()
            .returning(move |_| Ok(Some((person(id), hash.clone()))));
        users
    }

    #[tokio::test]
    async fn deletes_after_the_username_and_password_are_right() {
        let id = Uuid::new_v4();
        let mut accounts = MockAccountRepo::new();
        accounts
            .expect_delete()
            .withf(move |user, flag| *user == id && *flag)
            .once()
            .returning(|_, _| Ok(()));

        let result = DeleteAccount::new(
            Arc::new(users_with(id, "a-strong-password")),
            Arc::new(accounts),
        )
        .execute(id, "a-strong-password", " person ", true)
        .await;

        assert_eq!(result, Ok(()));
    }

    #[tokio::test]
    async fn refuses_a_wrong_confirmation_before_checking_anything_else() {
        let id = Uuid::new_v4();
        let mut users = MockUserRepo::new();
        users
            .expect_find_by_id()
            .returning(move |_| Ok(Some(person(id))));
        let mut accounts = MockAccountRepo::new();
        accounts.expect_delete().never();

        let result = DeleteAccount::new(Arc::new(users), Arc::new(accounts))
            .execute(id, "a-strong-password", "someone", false)
            .await;

        assert!(matches!(result, Err(AccountError::Invalid(_))));
    }

    #[tokio::test]
    async fn refuses_a_wrong_password_and_deletes_nothing() {
        let id = Uuid::new_v4();
        let mut accounts = MockAccountRepo::new();
        accounts.expect_delete().never();

        let result = DeleteAccount::new(
            Arc::new(users_with(id, "a-strong-password")),
            Arc::new(accounts),
        )
        .execute(id, "not-the-password", "person", false)
        .await;

        assert_eq!(result, Err(AccountError::WrongPassword));
    }

    #[tokio::test]
    async fn passes_on_the_workspaces_that_block_the_deletion() {
        let id = Uuid::new_v4();
        let blocking = vec![OwnedWorkspace {
            id: Uuid::new_v4(),
            name: "Team".to_string(),
            other_members: 2,
        }];
        let expected = blocking.clone();
        let mut accounts = MockAccountRepo::new();
        accounts
            .expect_delete()
            .once()
            .returning(move |_, _| Err(AccountError::Blocked(blocking.clone())));

        let result = DeleteAccount::new(
            Arc::new(users_with(id, "a-strong-password")),
            Arc::new(accounts),
        )
        .execute(id, "a-strong-password", "person", false)
        .await;

        assert_eq!(result, Err(AccountError::Blocked(expected)));
    }
}
