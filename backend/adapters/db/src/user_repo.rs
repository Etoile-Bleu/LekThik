use async_trait::async_trait;
use domain::{CreateUserError, NewUser, User, UserRepo, UserRepoError};
use sqlx::{PgPool, Row};
use uuid::Uuid;

pub struct PgUserRepo {
    pool: PgPool,
}

impl PgUserRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl UserRepo for PgUserRepo {
    async fn create(&self, new_user: NewUser) -> Result<User, CreateUserError> {
        let row = sqlx::query(
            "INSERT INTO users (email, username, password_hash) \
                VALUES ($1, $2, $3) \
                RETURNING id, email, username",
        )
        .bind(&new_user.email)
        .bind(&new_user.username)
        .bind(&new_user.password_hash)
        .fetch_one(&self.pool)
        .await
        .map_err(|error| match error.as_database_error() {
            Some(db_error) if db_error.is_unique_violation() => match db_error.constraint() {
                Some("users_username_key") => CreateUserError::UsernameAlreadyTaken,
                _ => CreateUserError::EmailAlreadyRegistered,
            },
            _ => CreateUserError::Repository(error.to_string()),
        })?;

        row_to_user(&row).map_err(CreateUserError::Repository)
    }

    async fn find_by_email(&self, email: &str) -> Result<Option<User>, UserRepoError> {
        let row = sqlx::query("SELECT id, email, username FROM users WHERE email = $1")
            .bind(email)
            .fetch_optional(&self.pool)
            .await
            .map_err(|error| UserRepoError::Repository(error.to_string()))?;

        row.as_ref()
            .map(row_to_user)
            .transpose()
            .map_err(UserRepoError::Repository)
    }

    async fn find_by_id(&self, id: Uuid) -> Result<Option<User>, UserRepoError> {
        let row = sqlx::query("SELECT id, email, username FROM users WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|error| UserRepoError::Repository(error.to_string()))?;

        row.as_ref()
            .map(row_to_user)
            .transpose()
            .map_err(UserRepoError::Repository)
    }

    async fn find_credentials_by_email(
        &self,
        email: &str,
    ) -> Result<Option<(User, String)>, UserRepoError> {
        let row =
            sqlx::query("SELECT id, email, username, password_hash FROM users WHERE email = $1")
                .bind(email)
                .fetch_optional(&self.pool)
                .await
                .map_err(|error| UserRepoError::Repository(error.to_string()))?;

        let Some(row) = row else {
            return Ok(None);
        };

        let user = row_to_user(&row).map_err(UserRepoError::Repository)?;
        let password_hash: String = row
            .try_get("password_hash")
            .map_err(|error| UserRepoError::Repository(error.to_string()))?;

        Ok(Some((user, password_hash)))
    }
}

fn row_to_user(row: &sqlx::postgres::PgRow) -> Result<User, String> {
    Ok(User {
        id: row.try_get("id").map_err(|error| error.to_string())?,
        email: row.try_get("email").map_err(|error| error.to_string())?,
        username: row.try_get("username").map_err(|error| error.to_string())?,
    })
}
