/// The tint behind a board's lists. A closed set of hues, so every one keeps
/// the text on top of it readable in every theme.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum BoardBackground {
    #[default]
    Default,
    Mist,
    Sage,
    Sand,
    Blush,
    Lilac,
    Slate,
    Dusk,
}

impl BoardBackground {
    pub fn as_str(self) -> &'static str {
        match self {
            BoardBackground::Default => "default",
            BoardBackground::Mist => "mist",
            BoardBackground::Sage => "sage",
            BoardBackground::Sand => "sand",
            BoardBackground::Blush => "blush",
            BoardBackground::Lilac => "lilac",
            BoardBackground::Slate => "slate",
            BoardBackground::Dusk => "dusk",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        [
            BoardBackground::Default,
            BoardBackground::Mist,
            BoardBackground::Sage,
            BoardBackground::Sand,
            BoardBackground::Blush,
            BoardBackground::Lilac,
            BoardBackground::Slate,
            BoardBackground::Dusk,
        ]
        .into_iter()
        .find(|candidate| candidate.as_str() == value)
    }
}

/// The accent colour used for focus rings, checks and highlights on a board.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum BoardAccent {
    #[default]
    Teal,
    Blue,
    Violet,
    Rose,
    Orange,
    Graphite,
}

impl BoardAccent {
    pub fn as_str(self) -> &'static str {
        match self {
            BoardAccent::Teal => "teal",
            BoardAccent::Blue => "blue",
            BoardAccent::Violet => "violet",
            BoardAccent::Rose => "rose",
            BoardAccent::Orange => "orange",
            BoardAccent::Graphite => "graphite",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        [
            BoardAccent::Teal,
            BoardAccent::Blue,
            BoardAccent::Violet,
            BoardAccent::Rose,
            BoardAccent::Orange,
            BoardAccent::Graphite,
        ]
        .into_iter()
        .find(|candidate| candidate.as_str() == value)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct BoardLook {
    pub background: BoardBackground,
    pub accent: BoardAccent,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_background_and_accent_round_trips_through_its_name() {
        for name in [
            "default", "mist", "sage", "sand", "blush", "lilac", "slate", "dusk",
        ] {
            assert_eq!(
                BoardBackground::parse(name).map(BoardBackground::as_str),
                Some(name)
            );
        }
        for name in ["teal", "blue", "violet", "rose", "orange", "graphite"] {
            assert_eq!(
                BoardAccent::parse(name).map(BoardAccent::as_str),
                Some(name)
            );
        }
    }

    #[test]
    fn unknown_names_are_rejected() {
        assert_eq!(BoardBackground::parse("#ff0000"), None);
        assert_eq!(BoardAccent::parse("hotpink"), None);
    }
}
