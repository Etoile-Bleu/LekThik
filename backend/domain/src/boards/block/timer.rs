use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{BlockSize, invalid, read};
use crate::boards::error::BoardsError;

pub const TIMER_FOCUS_MAX_MINUTES: u16 = 120;
pub const TIMER_SHORT_MAX_MINUTES: u16 = 60;
pub const TIMER_LONG_MAX_MINUTES: u16 = 120;
pub const TIMER_MAX_REMAINING_MS: u32 = 4 * 3_600_000;
pub const TIMER_MIN_END_MS: i64 = 1_000_000_000_000;
pub const TIMER_MAX_END_MS: i64 = 4_102_444_800_000;
pub const TIMER_MAX_CYCLE: u32 = 999;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TimerMode {
    #[default]
    Focus,
    ShortBreak,
    LongBreak,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TimerState {
    #[default]
    Idle,
    Running,
    Paused,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct TimerConfig {
    pub size: BlockSize,
    pub mode: TimerMode,
    pub focus_minutes: u16,
    pub short_minutes: u16,
    pub long_minutes: u16,
    pub state: TimerState,
    pub ends_at_ms: Option<i64>,
    pub remaining_ms: Option<u32>,
    pub cycle: u32,
}

impl Default for TimerConfig {
    fn default() -> Self {
        Self {
            size: BlockSize::Normal,
            mode: TimerMode::Focus,
            focus_minutes: 25,
            short_minutes: 5,
            long_minutes: 15,
            state: TimerState::Idle,
            ends_at_ms: None,
            remaining_ms: None,
            cycle: 0,
        }
    }
}

impl TimerConfig {
    fn check(&self) -> Result<(), BoardsError> {
        let in_range = |minutes: u16, max: u16| (1..=max).contains(&minutes);
        if !in_range(self.focus_minutes, TIMER_FOCUS_MAX_MINUTES)
            || !in_range(self.short_minutes, TIMER_SHORT_MAX_MINUTES)
            || !in_range(self.long_minutes, TIMER_LONG_MAX_MINUTES)
        {
            return Err(invalid("that length of time is not allowed"));
        }
        if self.cycle > TIMER_MAX_CYCLE {
            return Err(invalid("too many sessions"));
        }
        let end_ok = |end: i64| (TIMER_MIN_END_MS..=TIMER_MAX_END_MS).contains(&end);
        let left_ok = |left: u32| (1..=TIMER_MAX_REMAINING_MS).contains(&left);
        let consistent = match (self.state, self.ends_at_ms, self.remaining_ms) {
            (TimerState::Idle, None, None) => true,
            (TimerState::Running, Some(end), None) => end_ok(end),
            (TimerState::Paused, None, Some(left)) => left_ok(left),
            _ => false,
        };
        if consistent {
            Ok(())
        } else {
            Err(invalid(
                "a running timer needs its end, a paused one its time left, an idle one neither",
            ))
        }
    }
}

pub(super) fn parse(value: Value) -> Result<TimerConfig, BoardsError> {
    let timer: TimerConfig = read(value)?;
    timer.check()?;
    Ok(timer)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::super::{BlockConfig, ListKind};
    use super::*;

    #[test]
    fn a_timer_starts_idle_on_a_twenty_five_minute_focus() {
        let config = BlockConfig::parse(ListKind::Timer, json!({})).expect("parse");

        assert_eq!(config, BlockConfig::Timer(TimerConfig::default()));
        assert_eq!(
            config.to_value(),
            json!({
                "size": "normal", "mode": "focus", "focus_minutes": 25, "short_minutes": 5,
                "long_minutes": 15, "state": "idle", "ends_at_ms": null, "remaining_ms": null,
                "cycle": 0
            })
        );
    }

    #[test]
    fn a_timer_keeps_a_running_a_paused_and_an_idle_state_as_they_are() {
        for stored in [
            json!({ "state": "running", "ends_at_ms": 1_800_000_000_000_i64, "mode": "short_break", "cycle": 3 }),
            json!({ "state": "paused", "remaining_ms": 754_000, "mode": "long_break" }),
            json!({ "state": "idle", "focus_minutes": 50, "short_minutes": 10, "long_minutes": 30 }),
        ] {
            let config = BlockConfig::parse(ListKind::Timer, stored.clone()).expect("parse");
            let again = BlockConfig::parse(ListKind::Timer, config.to_value()).expect("parse");

            assert_eq!(config, again, "{stored}");
        }
    }

    #[test]
    fn a_timer_refuses_a_state_that_cannot_be_true() {
        for bad in [
            json!({ "state": "running" }),
            json!({ "state": "running", "ends_at_ms": 1_800_000_000_000_i64, "remaining_ms": 5 }),
            json!({ "state": "running", "ends_at_ms": 5 }),
            json!({ "state": "running", "ends_at_ms": 9_999_999_999_999_i64 }),
            json!({ "state": "paused" }),
            json!({ "state": "paused", "remaining_ms": 0 }),
            json!({ "state": "paused", "remaining_ms": TIMER_MAX_REMAINING_MS + 1 }),
            json!({ "state": "paused", "remaining_ms": 5, "ends_at_ms": 1_800_000_000_000_i64 }),
            json!({ "state": "idle", "ends_at_ms": 1_800_000_000_000_i64 }),
            json!({ "state": "idle", "remaining_ms": 5 }),
            json!({ "state": "done" }),
        ] {
            assert!(
                BlockConfig::parse(ListKind::Timer, bad.clone()).is_err(),
                "{bad}"
            );
        }
    }

    #[test]
    fn a_timer_refuses_lengths_modes_and_fields_outside_what_it_offers() {
        for bad in [
            json!({ "focus_minutes": 0 }),
            json!({ "focus_minutes": TIMER_FOCUS_MAX_MINUTES + 1 }),
            json!({ "short_minutes": TIMER_SHORT_MAX_MINUTES + 1 }),
            json!({ "long_minutes": 0 }),
            json!({ "focus_minutes": -5 }),
            json!({ "focus_minutes": 2.5 }),
            json!({ "mode": "nap" }),
            json!({ "cycle": TIMER_MAX_CYCLE + 1 }),
            json!({ "sound": true }),
            json!([]),
        ] {
            assert!(
                BlockConfig::parse(ListKind::Timer, bad.clone()).is_err(),
                "{bad}"
            );
        }
        let at_the_limits = json!({
            "focus_minutes": TIMER_FOCUS_MAX_MINUTES, "short_minutes": TIMER_SHORT_MAX_MINUTES,
            "long_minutes": TIMER_LONG_MAX_MINUTES, "cycle": TIMER_MAX_CYCLE
        });
        assert!(BlockConfig::parse(ListKind::Timer, at_the_limits).is_ok());
    }
}
