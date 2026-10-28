use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{BlockSize, clean_text, invalid, read};
use crate::boards::error::BoardsError;

pub const CLOCKS_MAX_ZONES: usize = 6;
pub const ZONE_MAX_CHARS: usize = 40;
pub const PLACE_NAME_MAX_CHARS: usize = 60;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Place {
    pub name: String,
    pub latitude_centi: i32,
    pub longitude_centi: i32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct ClocksConfig {
    pub size: BlockSize,
    pub zones: Vec<String>,
    pub place: Option<Place>,
}

impl Default for ClocksConfig {
    fn default() -> Self {
        Self {
            size: BlockSize::Normal,
            zones: Vec::new(),
            place: None,
        }
    }
}

fn is_zone_id(zone: &str) -> bool {
    let segment_ok = |segment: &str| {
        !segment.is_empty()
            && segment
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '+' | '-'))
    };
    let mut segments = zone.split('/');
    let count = zone.split('/').count();
    (1..=3).contains(&count) && segments.all(segment_ok)
}

pub(super) fn parse(value: Value) -> Result<ClocksConfig, BoardsError> {
    let mut clocks: ClocksConfig = read(value)?;
    if clocks.zones.len() > CLOCKS_MAX_ZONES {
        return Err(invalid(format!("at most {CLOCKS_MAX_ZONES} time zones")));
    }
    for (index, zone) in clocks.zones.iter().enumerate() {
        if zone.chars().count() > ZONE_MAX_CHARS || !is_zone_id(zone) {
            return Err(invalid("that is not a time zone name"));
        }
        if clocks.zones[..index].contains(zone) {
            return Err(invalid("each time zone can be added once"));
        }
    }
    if let Some(place) = &mut clocks.place {
        place.name = place.name.trim().to_string();
        if place.name.is_empty() {
            return Err(invalid("name the place the weather is for"));
        }
        clean_text(&place.name, PLACE_NAME_MAX_CHARS, false)?;
        if !(-9_000..=9_000).contains(&place.latitude_centi)
            || !(-18_000..=18_000).contains(&place.longitude_centi)
        {
            return Err(invalid("that position is not on Earth"));
        }
    }
    Ok(clocks)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::super::{BlockConfig, ListKind};
    use super::*;

    #[test]
    fn a_clocks_block_starts_with_no_zone_and_no_weather() {
        let config = BlockConfig::parse(ListKind::Clocks, json!({})).expect("parse");

        assert_eq!(config, BlockConfig::Clocks(ClocksConfig::default()));
        assert_eq!(
            config.to_value(),
            json!({ "size": "normal", "zones": [], "place": null })
        );
    }

    #[test]
    fn a_clocks_block_keeps_its_zones_in_order_and_a_rounded_place() {
        let stored = json!({
            "size": "wide",
            "zones": ["Europe/Paris", "America/Argentina/Buenos_Aires", "Etc/GMT+5", "UTC"],
            "place": { "name": "Paris", "latitude_centi": 4886, "longitude_centi": 235 }
        });

        let config = BlockConfig::parse(ListKind::Clocks, stored.clone()).expect("parse");

        assert_eq!(config.to_value(), stored);
        let trimmed = BlockConfig::parse(
            ListKind::Clocks,
            json!({ "place": { "name": "  Lyon ", "latitude_centi": 4576, "longitude_centi": 484 } }),
        )
        .expect("parse");
        assert_eq!(trimmed.to_value()["place"]["name"], "Lyon");
    }

    #[test]
    fn a_clocks_block_refuses_odd_zones_too_many_duplicates_and_off_planet_places() {
        let seven: Vec<String> = (0..=CLOCKS_MAX_ZONES)
            .map(|i| format!("Etc/GMT+{i}"))
            .collect();
        let long = format!("Europe/{}", "a".repeat(ZONE_MAX_CHARS));
        for bad in [
            json!({ "zones": seven }),
            json!({ "zones": ["Europe/Paris", "Europe/Paris"] }),
            json!({ "zones": [long] }),
            json!({ "zones": [""] }),
            json!({ "zones": ["Europe//Paris"] }),
            json!({ "zones": ["/Europe/Paris"] }),
            json!({ "zones": ["Europe/Paris/../../etc"] }),
            json!({ "zones": ["Europe/Pa ris"] }),
            json!({ "zones": ["Europe/Paris\n"] }),
            json!({ "zones": ["<script>"] }),
            json!({ "zones": [5] }),
            json!({ "place": { "name": "", "latitude_centi": 0, "longitude_centi": 0 } }),
            json!({ "place": { "name": "x", "latitude_centi": 9001, "longitude_centi": 0 } }),
            json!({ "place": { "name": "x", "latitude_centi": 0, "longitude_centi": -18001 } }),
            json!({ "place": { "name": "x", "latitude_centi": 48.86, "longitude_centi": 0 } }),
            json!({ "place": { "name": "x", "latitude_centi": 0 } }),
            json!({ "place": { "name": "a\nb", "latitude_centi": 0, "longitude_centi": 0 } }),
            json!({ "place": { "name": "x", "latitude_centi": 0, "longitude_centi": 0, "country": "FR" } }),
            json!({ "api_key": "x" }),
        ] {
            assert!(
                BlockConfig::parse(ListKind::Clocks, bad.clone()).is_err(),
                "{bad}"
            );
        }
        let six: Vec<String> = (0..CLOCKS_MAX_ZONES)
            .map(|i| format!("Etc/GMT+{i}"))
            .collect();
        assert!(BlockConfig::parse(ListKind::Clocks, json!({ "zones": six })).is_ok());
    }
}
