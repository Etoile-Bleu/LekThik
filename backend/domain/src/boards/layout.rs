use uuid::Uuid;

use super::error::BoardsError;
use super::limits::MAX_LISTS_PER_BOARD;

/// The free layout is a grid this many cells wide.
pub const GRID_COLUMNS: u32 = 12;
/// No tile is taller than this many cells.
pub const GRID_MAX_TILE_HEIGHT: u32 = 100;
/// Nothing sits lower than this many rows from the top.
pub const GRID_MAX_ROWS: u32 = 400;

/// Where a panel sits on the grid of its board and how big it is, all in cells.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Placement {
    pub x: u8,
    pub y: u16,
    pub w: u8,
    pub h: u16,
}

impl Placement {
    pub fn parse(x: u32, y: u32, w: u32, h: u32) -> Result<Self, BoardsError> {
        let invalid = |what: &str| BoardsError::Invalid(format!("a tile {what}"));

        if !(1..=GRID_COLUMNS).contains(&w) {
            return Err(invalid("is between 1 and 12 columns wide"));
        }
        if x.checked_add(w).is_none_or(|right| right > GRID_COLUMNS) {
            return Err(invalid("must stay inside the 12 columns"));
        }
        if !(1..=GRID_MAX_TILE_HEIGHT).contains(&h) {
            return Err(invalid("is between 1 and 100 rows tall"));
        }
        if y.checked_add(h).is_none_or(|bottom| bottom > GRID_MAX_ROWS) {
            return Err(invalid("must stay within the first 400 rows"));
        }

        // Every bound above fits the narrower types, so these casts never truncate.
        Ok(Self {
            x: x as u8,
            y: y as u16,
            w: w as u8,
            h: h as u16,
        })
    }
}

/// One panel and where it goes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PanelPlacement {
    pub id: Uuid,
    pub placement: Placement,
}

/// Checks a whole layout before it is stored: something to place, no panel twice, no more
/// panels than a board can hold.
pub fn check_layout(items: &[PanelPlacement]) -> Result<(), BoardsError> {
    if items.is_empty() {
        return Err(BoardsError::Invalid(
            "a layout places at least one panel".to_string(),
        ));
    }
    if i64::try_from(items.len()).is_ok_and(|count| count > MAX_LISTS_PER_BOARD) {
        return Err(BoardsError::Invalid(format!(
            "a board has at most {MAX_LISTS_PER_BOARD} panels"
        )));
    }
    let mut seen = std::collections::HashSet::new();
    if !items.iter().all(|item| seen.insert(item.id)) {
        return Err(BoardsError::Invalid(
            "a panel is placed only once".to_string(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_tiles_inside_the_grid() {
        assert!(Placement::parse(0, 0, 12, 1).is_ok());
        assert!(Placement::parse(9, 399, 3, 1).is_ok());
        assert!(Placement::parse(4, 10, 4, 100).is_ok());
    }

    #[test]
    fn refuses_tiles_that_leave_the_grid_or_have_no_size() {
        for (x, y, w, h) in [
            (0, 0, 0, 3),
            (0, 0, 13, 3),
            (10, 0, 3, 3),
            (12, 0, 1, 3),
            (0, 0, 3, 0),
            (0, 0, 3, 101),
            (0, 399, 3, 2),
            (u32::MAX, 0, 3, 3),
            (0, u32::MAX, 3, 3),
        ] {
            assert!(
                matches!(Placement::parse(x, y, w, h), Err(BoardsError::Invalid(_))),
                "{x} {y} {w} {h}"
            );
        }
    }

    fn item(id: Uuid) -> PanelPlacement {
        PanelPlacement {
            id,
            placement: Placement {
                x: 0,
                y: 0,
                w: 3,
                h: 3,
            },
        }
    }

    #[test]
    fn a_layout_needs_a_panel_and_no_repeats() {
        let id = Uuid::new_v4();

        assert!(check_layout(&[item(id)]).is_ok());
        assert!(check_layout(&[]).is_err());
        assert!(check_layout(&[item(id), item(id)]).is_err());
    }

    #[test]
    fn a_layout_cannot_hold_more_than_a_board() {
        let items: Vec<_> = (0..=MAX_LISTS_PER_BOARD)
            .map(|_| item(Uuid::new_v4()))
            .collect();

        assert!(check_layout(&items).is_err());
    }
}
