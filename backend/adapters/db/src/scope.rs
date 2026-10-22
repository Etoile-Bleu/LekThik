macro_rules! owned_board {
    () => {
        "boards b JOIN workspaces w ON w.id = b.workspace_id"
    };
}

macro_rules! owned_list {
    () => {
        "lists l JOIN boards b ON b.id = l.board_id JOIN workspaces w ON w.id = b.workspace_id"
    };
}

macro_rules! owned_card {
    () => {
        "cards c JOIN lists l ON l.id = c.list_id JOIN boards b ON b.id = l.board_id \
         JOIN workspaces w ON w.id = b.workspace_id"
    };
}

pub(crate) fn repository_error(error: sqlx::Error) -> domain::boards::BoardsError {
    domain::boards::BoardsError::Repository(error.to_string())
}
