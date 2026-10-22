use std::collections::BTreeMap;
use std::sync::Arc;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const MAX_BOARD_PREFERENCES: usize = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    #[default]
    System,
    Light,
    Dark,
    Contrast,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Density {
    Compact,
    #[default]
    Comfortable,
    Spacious,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TextSize {
    #[default]
    Normal,
    Large,
    Larger,
    Largest,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Motion {
    #[default]
    System,
    Reduce,
}

/// Colour palettes that stay distinguishable for the common kinds of colour blindness.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ColorVision {
    #[default]
    Standard,
    /// Red and green are hard to tell apart (protanopia, deuteranopia).
    RedGreen,
    /// Blue and yellow are hard to tell apart (tritanopia).
    BlueYellow,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReadingFont {
    #[default]
    Standard,
    /// Atkinson Hyperlegible, drawn to make similar letters easy to tell apart.
    Hyperlegible,
    /// Lexend, designed to reduce visual crowding.
    Lexend,
}

/// Extra room between letters and words, for people who find tight text hard to read.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LetterSpacing {
    #[default]
    Normal,
    Wide,
    Wider,
}

/// What a card shows on the board.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct CardDisplay {
    pub labels: bool,
    pub due_date: bool,
    pub assignees: bool,
    pub description_marker: bool,
    pub description_preview: bool,
}

impl Default for CardDisplay {
    fn default() -> Self {
        Self {
            labels: true,
            due_date: true,
            assignees: true,
            description_marker: true,
            description_preview: false,
        }
    }
}

/// Settings that only make sense for one board, for one person.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct BoardPreferences {
    pub card_display: Option<CardDisplay>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Preferences {
    pub theme: Theme,
    pub density: Density,
    pub text_size: TextSize,
    pub motion: Motion,
    pub color_vision: ColorVision,
    /// Marks label colours with a distinct shape so they never rely on colour alone.
    pub label_shapes: bool,
    pub reading_font: ReadingFont,
    pub letter_spacing: LetterSpacing,
    /// A thicker, two tone focus ring.
    pub strong_focus: bool,
    /// Larger buttons and controls, easier to hit.
    pub large_targets: bool,
    /// No tint behind boards, only the plain theme background.
    pub flat_backgrounds: bool,
    /// Tell screen readers when teammates change the board you are looking at.
    pub announce_changes: bool,
    pub card_display: CardDisplay,
    pub boards: BTreeMap<Uuid, BoardPreferences>,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum PreferencesError {
    #[error("invalid preferences: {0}")]
    Invalid(String),
    #[error("repository error: {0}")]
    Repository(String),
}

impl Preferences {
    pub fn validate(&self) -> Result<(), PreferencesError> {
        if self.boards.len() > MAX_BOARD_PREFERENCES {
            return Err(PreferencesError::Invalid(format!(
                "settings can be kept for at most {MAX_BOARD_PREFERENCES} boards"
            )));
        }

        Ok(())
    }
}

#[cfg_attr(feature = "test-utils", mockall::automock)]
#[async_trait]
pub trait PreferencesRepo: Send + Sync {
    async fn get(&self, user_id: Uuid) -> Result<Option<Preferences>, PreferencesError>;
    async fn save(&self, user_id: Uuid, preferences: &Preferences) -> Result<(), PreferencesError>;
}

#[async_trait]
impl PreferencesRepo for Arc<dyn PreferencesRepo> {
    async fn get(&self, user_id: Uuid) -> Result<Option<Preferences>, PreferencesError> {
        self.as_ref().get(user_id).await
    }

    async fn save(&self, user_id: Uuid, preferences: &Preferences) -> Result<(), PreferencesError> {
        self.as_ref().save(user_id, preferences).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_the_current_look() {
        let preferences = Preferences::default();

        assert_eq!(preferences.theme, Theme::System);
        assert_eq!(preferences.density, Density::Comfortable);
        assert!(preferences.card_display.labels);
        assert!(!preferences.card_display.description_preview);
        assert_eq!(preferences.color_vision, ColorVision::Standard);
        assert_eq!(preferences.letter_spacing, LetterSpacing::Normal);
        assert!(!preferences.strong_focus && !preferences.large_targets);
    }

    #[test]
    fn missing_fields_fall_back_to_defaults() {
        let parsed: Preferences = serde_json::from_str(r#"{"theme":"dark"}"#).expect("parse");

        assert_eq!(parsed.theme, Theme::Dark);
        assert_eq!(parsed.density, Density::Comfortable);
    }

    #[test]
    fn unknown_fields_and_values_are_refused() {
        assert!(serde_json::from_str::<Preferences>(r#"{"colour":"red"}"#).is_err());
        assert!(serde_json::from_str::<Preferences>(r#"{"theme":"neon"}"#).is_err());
        assert!(serde_json::from_str::<Preferences>(r#"{"text_size":"huge"}"#).is_err());
        assert!(serde_json::from_str::<Preferences>(r#"{"color_vision":"rainbow"}"#).is_err());
        assert!(serde_json::from_str::<Preferences>(r#"{"reading_font":"comic"}"#).is_err());
    }

    #[test]
    fn accessibility_settings_round_trip() {
        let parsed: Preferences = serde_json::from_str(
            r#"{"color_vision":"redgreen","label_shapes":true,"reading_font":"lexend",
                "letter_spacing":"wider","strong_focus":true,"large_targets":true,
                "flat_backgrounds":true,"announce_changes":true,"text_size":"largest"}"#,
        )
        .expect("parse");

        assert_eq!(parsed.color_vision, ColorVision::RedGreen);
        assert_eq!(parsed.reading_font, ReadingFont::Lexend);
        assert_eq!(parsed.letter_spacing, LetterSpacing::Wider);
        assert_eq!(parsed.text_size, TextSize::Largest);
        assert!(parsed.label_shapes && parsed.strong_focus && parsed.large_targets);
        assert!(parsed.flat_backgrounds && parsed.announce_changes);
        let again: Preferences =
            serde_json::from_str(&serde_json::to_string(&parsed).expect("json")).expect("parse");
        assert_eq!(again, parsed);
    }

    #[test]
    fn caps_the_number_of_per_board_settings() {
        let mut preferences = Preferences::default();
        for _ in 0..=MAX_BOARD_PREFERENCES {
            preferences
                .boards
                .insert(Uuid::new_v4(), BoardPreferences::default());
        }

        assert!(preferences.validate().is_err());
    }
}
