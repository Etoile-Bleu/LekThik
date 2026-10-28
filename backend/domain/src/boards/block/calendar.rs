use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{BlockSize, read};
use crate::boards::error::BoardsError;

/// How far ahead the agenda looks.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgendaRange {
    Today,
    #[default]
    Week,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct CalendarConfig {
    pub size: BlockSize,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct AgendaConfig {
    pub size: BlockSize,
    pub range: AgendaRange,
    /// Only the cards assigned to whoever is looking.
    pub mine_only: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct OverdueConfig {
    pub size: BlockSize,
}

pub(super) fn parse_calendar(value: Value) -> Result<CalendarConfig, BoardsError> {
    read(value)
}

pub(super) fn parse_agenda(value: Value) -> Result<AgendaConfig, BoardsError> {
    read(value)
}

pub(super) fn parse_overdue(value: Value) -> Result<OverdueConfig, BoardsError> {
    read(value)
}
