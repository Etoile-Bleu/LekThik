use async_trait::async_trait;
use domain::{VerificationCodeRepo, VerificationCodeRepoError, VerificationPurpose};
use sqlx::{PgPool, Row};
use uuid::Uuid;

pub struct PgVerificationCodeRepo {
    pool: PgPool,
}

impl PgVerificationCodeRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

fn purpose_column(purpose: VerificationPurpose) -> &'static str {
    match purpose {
        VerificationPurpose::EmailVerification => "email_verification",
        VerificationPurpose::PasswordReset => "password_reset",
    }
}

fn repository_error(error: sqlx::Error) -> VerificationCodeRepoError {
    VerificationCodeRepoError::Repository(error.to_string())
}

#[async_trait]
impl VerificationCodeRepo for PgVerificationCodeRepo {
    async fn store(
        &self,
        user_id: Uuid,
        purpose: VerificationPurpose,
        code_hash: &str,
        ttl_seconds: i64,
    ) -> Result<(), VerificationCodeRepoError> {
        sqlx::query(
            "INSERT INTO verification_codes (user_id, purpose, code_hash, attempts, expires_at) \
                VALUES ($1, $2, $3, 0, now() + make_interval(secs => $4)) \
                ON CONFLICT (user_id, purpose) DO UPDATE SET \
                    code_hash = EXCLUDED.code_hash, \
                    attempts = 0, \
                    expires_at = EXCLUDED.expires_at, \
                    created_at = now()",
        )
        .bind(user_id)
        .bind(purpose_column(purpose))
        .bind(code_hash)
        .bind(ttl_seconds as f64)
        .execute(&self.pool)
        .await
        .map_err(repository_error)?;

        Ok(())
    }

    async fn consume(
        &self,
        user_id: Uuid,
        purpose: VerificationPurpose,
        code_hash: &str,
        max_attempts: i32,
    ) -> Result<bool, VerificationCodeRepoError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;

        let row = sqlx::query(
            "SELECT code_hash, attempts, expires_at > now() AS is_live \
                FROM verification_codes \
                WHERE user_id = $1 AND purpose = $2 \
                FOR UPDATE",
        )
        .bind(user_id)
        .bind(purpose_column(purpose))
        .fetch_optional(&mut *transaction)
        .await
        .map_err(repository_error)?;

        let Some(row) = row else {
            return Ok(false);
        };

        let stored_hash: String = row.try_get("code_hash").map_err(repository_error)?;
        let attempts: i32 = row.try_get("attempts").map_err(repository_error)?;
        let is_live: bool = row.try_get("is_live").map_err(repository_error)?;

        if !is_live || attempts >= max_attempts {
            return Ok(false);
        }

        if stored_hash.trim() == code_hash {
            sqlx::query("DELETE FROM verification_codes WHERE user_id = $1 AND purpose = $2")
                .bind(user_id)
                .bind(purpose_column(purpose))
                .execute(&mut *transaction)
                .await
                .map_err(repository_error)?;
            transaction.commit().await.map_err(repository_error)?;
            return Ok(true);
        }

        sqlx::query(
            "UPDATE verification_codes SET attempts = attempts + 1 \
                WHERE user_id = $1 AND purpose = $2",
        )
        .bind(user_id)
        .bind(purpose_column(purpose))
        .execute(&mut *transaction)
        .await
        .map_err(repository_error)?;
        transaction.commit().await.map_err(repository_error)?;

        Ok(false)
    }
}
