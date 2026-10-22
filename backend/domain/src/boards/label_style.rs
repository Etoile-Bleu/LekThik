use super::error::BoardsError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LabelColor {
    Slate,
    Red,
    Orange,
    Amber,
    Green,
    Teal,
    Blue,
    Violet,
    Pink,
}

impl LabelColor {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Slate => "slate",
            Self::Red => "red",
            Self::Orange => "orange",
            Self::Amber => "amber",
            Self::Green => "green",
            Self::Teal => "teal",
            Self::Blue => "blue",
            Self::Violet => "violet",
            Self::Pink => "pink",
        }
    }

    pub fn parse(raw: &str) -> Result<Self, BoardsError> {
        match raw {
            "slate" => Ok(Self::Slate),
            "red" => Ok(Self::Red),
            "orange" => Ok(Self::Orange),
            "amber" => Ok(Self::Amber),
            "green" => Ok(Self::Green),
            "teal" => Ok(Self::Teal),
            "blue" => Ok(Self::Blue),
            "violet" => Ok(Self::Violet),
            "pink" => Ok(Self::Pink),
            _ => Err(BoardsError::Invalid("unknown label color".to_string())),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Priority {
    Unset,
    Low,
    Medium,
    High,
    Urgent,
}

impl Priority {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Unset => "none",
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
            Self::Urgent => "urgent",
        }
    }

    pub fn parse(raw: &str) -> Result<Self, BoardsError> {
        match raw {
            "none" => Ok(Self::Unset),
            "low" => Ok(Self::Low),
            "medium" => Ok(Self::Medium),
            "high" => Ok(Self::High),
            "urgent" => Ok(Self::Urgent),
            _ => Err(BoardsError::Invalid("unknown priority".to_string())),
        }
    }

    pub fn level(self) -> i16 {
        match self {
            Self::Unset => 0,
            Self::Low => 1,
            Self::Medium => 2,
            Self::High => 3,
            Self::Urgent => 4,
        }
    }

    pub fn from_level(level: i16) -> Result<Self, BoardsError> {
        match level {
            0 => Ok(Self::Unset),
            1 => Ok(Self::Low),
            2 => Ok(Self::Medium),
            3 => Ok(Self::High),
            4 => Ok(Self::Urgent),
            _ => Err(BoardsError::Repository(format!(
                "stored priority level {level} is out of range"
            ))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const COLORS: [LabelColor; 9] = [
        LabelColor::Slate,
        LabelColor::Red,
        LabelColor::Orange,
        LabelColor::Amber,
        LabelColor::Green,
        LabelColor::Teal,
        LabelColor::Blue,
        LabelColor::Violet,
        LabelColor::Pink,
    ];

    const PRIORITIES: [Priority; 5] = [
        Priority::Unset,
        Priority::Low,
        Priority::Medium,
        Priority::High,
        Priority::Urgent,
    ];

    #[test]
    fn every_color_round_trips_through_its_name() {
        for color in COLORS {
            assert_eq!(LabelColor::parse(color.as_str()), Ok(color));
        }
    }

    #[test]
    fn unknown_colors_are_rejected() {
        assert!(LabelColor::parse("#ff0000").is_err());
        assert!(LabelColor::parse("expression(alert(1))").is_err());
    }

    #[test]
    fn every_priority_round_trips_through_its_name_and_level() {
        for priority in PRIORITIES {
            assert_eq!(Priority::parse(priority.as_str()), Ok(priority));
            assert_eq!(Priority::from_level(priority.level()), Ok(priority));
        }
    }

    #[test]
    fn unknown_priorities_are_rejected() {
        assert!(Priority::parse("critical").is_err());
        assert!(Priority::from_level(9).is_err());
    }

    #[test]
    fn priorities_are_ordered_by_level() {
        let levels: Vec<i16> = PRIORITIES.iter().map(|priority| priority.level()).collect();
        assert!(levels.windows(2).all(|pair| pair[0] < pair[1]));
    }
}
