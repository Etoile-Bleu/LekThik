use super::error::BoardsError;

const FIRST_YEAR: u32 = 2000;
const LAST_YEAR: u32 = 2100;

/// A calendar day with no time and no time zone, written `YYYY-MM-DD`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DueDate(String);

fn is_leap(year: u32) -> bool {
    (year.is_multiple_of(4) && !year.is_multiple_of(100)) || year.is_multiple_of(400)
}

fn days_in(year: u32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        _ if is_leap(year) => 29,
        _ => 28,
    }
}

impl DueDate {
    pub fn parse(value: &str) -> Result<Self, BoardsError> {
        let invalid = || BoardsError::Invalid("a due date looks like 2026-10-31".to_string());

        let bytes = value.as_bytes();
        let shaped = bytes.len() == 10
            && bytes[4] == b'-'
            && bytes[7] == b'-'
            && bytes
                .iter()
                .enumerate()
                .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit());
        if !shaped {
            return Err(invalid());
        }

        let year: u32 = value[0..4].parse().map_err(|_| invalid())?;
        let month: u32 = value[5..7].parse().map_err(|_| invalid())?;
        let day: u32 = value[8..10].parse().map_err(|_| invalid())?;

        let real = (FIRST_YEAR..=LAST_YEAR).contains(&year)
            && (1..=12).contains(&month)
            && day >= 1
            && day <= days_in(year, month);
        if !real {
            return Err(invalid());
        }

        Ok(Self(value.to_string()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn into_string(self) -> String {
        self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_real_calendar_days() {
        for value in ["2026-10-31", "2024-02-29", "2000-01-01", "2100-12-31"] {
            assert_eq!(
                DueDate::parse(value).map(DueDate::into_string).as_deref(),
                Ok(value)
            );
        }
    }

    #[test]
    fn rejects_days_that_do_not_exist() {
        for value in [
            "2026-02-29",
            "2026-04-31",
            "2026-13-01",
            "2026-00-10",
            "2026-10-00",
        ] {
            assert!(DueDate::parse(value).is_err(), "{value}");
        }
    }

    #[test]
    fn rejects_other_shapes_and_absurd_years() {
        for value in [
            "",
            "2026-1-5",
            "26-10-31",
            "2026/10/31",
            "2026-10-31T10:00",
            "20261031",
            "abcd-ef-gh",
            "1999-12-31",
            "2101-01-01",
            " 2026-10-31",
        ] {
            assert!(DueDate::parse(value).is_err(), "{value}");
        }
    }
}
