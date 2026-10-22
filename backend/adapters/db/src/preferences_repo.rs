use async_trait::async_trait;
use domain::{Preferences, PreferencesError, PreferencesRepo};
use sqlx::PgPool;
use uuid::Uuid;

pub struct PgPreferencesRepo {
    pool: PgPool,
}

impl PgPreferencesRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

fn repository_error(error: impl std::fmt::Display) -> PreferencesError {
    PreferencesError::Repository(error.to_string())
}

#[async_trait]
impl PreferencesRepo for PgPreferencesRepo {
    async fn get(&self, user_id: Uuid) -> Result<Option<Preferences>, PreferencesError> {
        let data: Option<String> =
            sqlx::query_scalar("SELECT data::text FROM user_preferences WHERE user_id = $1")
                .bind(user_id)
                .fetch_optional(&self.pool)
                .await
                .map_err(repository_error)?;

        data.map(|json| serde_json::from_str(&json).map_err(repository_error))
            .transpose()
    }

    async fn save(&self, user_id: Uuid, preferences: &Preferences) -> Result<(), PreferencesError> {
        let json = serde_json::to_string(preferences).map_err(repository_error)?;

        sqlx::query(
            "INSERT INTO user_preferences (user_id, data) VALUES ($1, $2::jsonb) \
             ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()",
        )
        .bind(user_id)
        .bind(json)
        .execute(&self.pool)
        .await
        .map_err(repository_error)?;

        Ok(())
    }
}
