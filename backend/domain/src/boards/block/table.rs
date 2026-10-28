use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{BlockSize, clean_text, invalid, read};
use crate::boards::error::BoardsError;

pub const TABLE_MAX_ROWS: usize = 100;
pub const TABLE_MAX_COLUMNS: usize = 12;
pub const TABLE_CELL_MAX_CHARS: usize = 200;
pub const TABLE_MAX_BYTES: usize = 40_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct TableConfig {
    pub size: BlockSize,
    pub header: bool,
    pub rows: Vec<Vec<String>>,
}

impl Default for TableConfig {
    fn default() -> Self {
        Self {
            size: BlockSize::Wide,
            header: true,
            rows: Vec::new(),
        }
    }
}

pub(super) fn parse(value: Value) -> Result<TableConfig, BoardsError> {
    let mut table: TableConfig = read(value)?;
    if table.rows.len() > TABLE_MAX_ROWS {
        return Err(invalid(format!("at most {TABLE_MAX_ROWS} rows")));
    }
    let width = table.rows.iter().map(Vec::len).max().unwrap_or(0);
    if width > TABLE_MAX_COLUMNS {
        return Err(invalid(format!("at most {TABLE_MAX_COLUMNS} columns")));
    }
    let mut bytes = 0;
    for row in &mut table.rows {
        row.resize(width, String::new());
        for cell in row.iter() {
            clean_text(cell, TABLE_CELL_MAX_CHARS, false)?;
            bytes += cell.len();
        }
    }
    if bytes > TABLE_MAX_BYTES {
        return Err(invalid("the table holds too much text"));
    }
    Ok(table)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::super::{BlockConfig, ListKind};
    use super::*;

    #[test]
    fn a_table_starts_empty_with_a_header_row() {
        let config = BlockConfig::parse(ListKind::Table, json!({})).expect("parse");

        assert_eq!(config, BlockConfig::Table(TableConfig::default()));
        assert_eq!(
            config.to_value(),
            json!({ "size": "wide", "header": true, "rows": [] })
        );
    }

    #[test]
    fn a_table_keeps_its_cells_exactly_and_pads_short_rows() {
        let config = BlockConfig::parse(
            ListKind::Table,
            json!({ "rows": [["Name", "Cost", "Note"], ["Rent", "800"], ["=SUM(A1)", " 5 ", "é"]] }),
        )
        .expect("parse");

        assert_eq!(
            config.to_value()["rows"],
            json!([
                ["Name", "Cost", "Note"],
                ["Rent", "800", ""],
                ["=SUM(A1)", " 5 ", "é"]
            ])
        );
    }

    #[test]
    fn a_table_refuses_too_many_rows_columns_text_and_hidden_characters() {
        let cell = "x".repeat(TABLE_CELL_MAX_CHARS + 1);
        let wide_row: Vec<String> = (0..=TABLE_MAX_COLUMNS).map(|_| "a".to_string()).collect();
        let tall: Vec<Vec<String>> = (0..=TABLE_MAX_ROWS)
            .map(|_| vec!["a".to_string()])
            .collect();
        let heavy_cell = "é".repeat(TABLE_CELL_MAX_CHARS);
        let heavy: Vec<Vec<String>> = (0..TABLE_MAX_ROWS)
            .map(|_| vec![heavy_cell.clone(); 3])
            .collect();
        for bad in [
            json!({ "rows": [[cell]] }),
            json!({ "rows": [wide_row] }),
            json!({ "rows": tall }),
            json!({ "rows": heavy }),
            json!({ "rows": [["a\tb"]] }),
            json!({ "rows": [["a\nb"]] }),
            json!({ "rows": [["nul\u{0}"]] }),
            json!({ "rows": [[5]] }),
            json!({ "rows": "a,b" }),
            json!({ "formula": "SUM" }),
            json!([]),
        ] {
            assert!(
                BlockConfig::parse(ListKind::Table, bad.clone()).is_err(),
                "{bad}"
            );
        }
        let widest: Vec<String> = (0..TABLE_MAX_COLUMNS).map(|_| "a".to_string()).collect();
        let tallest: Vec<Vec<String>> = (0..TABLE_MAX_ROWS).map(|_| widest.clone()).collect();
        assert!(BlockConfig::parse(ListKind::Table, json!({ "rows": tallest })).is_ok());
    }
}
