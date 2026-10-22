use std::sync::Arc;

use domain::{Preferences, PreferencesError, PreferencesRepo};
use uuid::Uuid;

pub struct GetPreferences {
    repo: Arc<dyn PreferencesRepo>,
}

impl GetPreferences {
    pub fn new(repo: Arc<dyn PreferencesRepo>) -> Self {
        Self { repo }
    }

    /// Someone who never changed a setting gets the defaults.
    pub async fn execute(&self, user_id: Uuid) -> Result<Preferences, PreferencesError> {
        Ok(self.repo.get(user_id).await?.unwrap_or_default())
    }
}

pub struct SavePreferences {
    repo: Arc<dyn PreferencesRepo>,
}

impl SavePreferences {
    pub fn new(repo: Arc<dyn PreferencesRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        preferences: Preferences,
    ) -> Result<Preferences, PreferencesError> {
        preferences.validate()?;
        self.repo.save(user_id, &preferences).await?;

        Ok(preferences)
    }
}

#[cfg(test)]
mod tests {
    use domain::{BoardPreferences, MAX_BOARD_PREFERENCES, MockPreferencesRepo, Theme};

    use super::*;

    #[tokio::test]
    async fn defaults_for_someone_who_never_saved() {
        let mut repo = MockPreferencesRepo::new();
        repo.expect_get().returning(|_| Ok(None));

        let preferences = GetPreferences::new(Arc::new(repo))
            .execute(Uuid::new_v4())
            .await
            .expect("preferences");

        assert_eq!(preferences, Preferences::default());
    }

    #[tokio::test]
    async fn saves_what_it_was_given() {
        let mut repo = MockPreferencesRepo::new();
        repo.expect_save()
            .times(1)
            .withf(|_, saved| saved.theme == Theme::Dark)
            .returning(|_, _| Ok(()));
        let wanted = Preferences {
            theme: Theme::Dark,
            ..Preferences::default()
        };

        let saved = SavePreferences::new(Arc::new(repo))
            .execute(Uuid::new_v4(), wanted.clone())
            .await
            .expect("saved");

        assert_eq!(saved, wanted);
    }

    #[tokio::test]
    async fn refuses_an_oversized_set_before_touching_storage() {
        let mut oversized = Preferences::default();
        for _ in 0..=MAX_BOARD_PREFERENCES {
            oversized
                .boards
                .insert(Uuid::new_v4(), BoardPreferences::default());
        }

        let result = SavePreferences::new(Arc::new(MockPreferencesRepo::new()))
            .execute(Uuid::new_v4(), oversized)
            .await;

        assert!(matches!(result, Err(PreferencesError::Invalid(_))));
    }
}
