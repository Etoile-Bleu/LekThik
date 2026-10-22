use domain::boards::BoardsError;
use sqlx::PgPool;
use uuid::Uuid;

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

macro_rules! owned_label {
    () => {
        "labels lb JOIN boards b ON b.id = lb.board_id JOIN workspaces w ON w.id = b.workspace_id"
    };
}

// Access predicates. Each one expects the workspace to be aliased `w` and takes
// the placeholder holding the acting user, e.g. `member_of!("$2")`.

macro_rules! member_of {
    ($user:literal) => {
        concat!(
            "EXISTS (SELECT 1 FROM workspace_members m \
             WHERE m.workspace_id = w.id AND m.user_id = ",
            $user,
            ")"
        )
    };
}

macro_rules! writer_of {
    ($user:literal) => {
        concat!(
            "EXISTS (SELECT 1 FROM workspace_members m \
             WHERE m.workspace_id = w.id AND m.user_id = ",
            $user,
            " AND m.role IN ('owner', 'admin', 'writer'))"
        )
    };
}

macro_rules! admin_of {
    ($user:literal) => {
        concat!(
            "EXISTS (SELECT 1 FROM workspace_members m \
             WHERE m.workspace_id = w.id AND m.user_id = ",
            $user,
            " AND m.role IN ('owner', 'admin'))"
        )
    };
}

pub(crate) fn repository_error(error: sqlx::Error) -> BoardsError {
    BoardsError::Repository(error.to_string())
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum Kind {
    Workspace,
    Board,
    List,
    Card,
    Label,
}

/// Explains why a scoped query matched nothing: a user who belongs to the
/// workspace but lacks the role gets `Forbidden`, anybody else gets `NotFound`
/// so foreign ids stay undiscoverable.
pub(crate) async fn denial(pool: &PgPool, kind: Kind, user_id: Uuid, id: Uuid) -> BoardsError {
    let sql = match kind {
        Kind::Workspace => concat!(
            "SELECT 1 FROM workspaces w WHERE w.id = $1 AND ",
            member_of!("$2")
        ),
        Kind::Board => concat!(
            "SELECT 1 FROM ",
            owned_board!(),
            " WHERE b.id = $1 AND ",
            member_of!("$2")
        ),
        Kind::List => concat!(
            "SELECT 1 FROM ",
            owned_list!(),
            " WHERE l.id = $1 AND ",
            member_of!("$2")
        ),
        Kind::Card => concat!(
            "SELECT 1 FROM ",
            owned_card!(),
            " WHERE c.id = $1 AND ",
            member_of!("$2")
        ),
        Kind::Label => concat!(
            "SELECT 1 FROM ",
            owned_label!(),
            " WHERE lb.id = $1 AND ",
            member_of!("$2")
        ),
    };

    match sqlx::query(sql)
        .bind(id)
        .bind(user_id)
        .fetch_optional(pool)
        .await
    {
        Ok(Some(_)) => BoardsError::Forbidden,
        Ok(None) => BoardsError::NotFound,
        Err(error) => repository_error(error),
    }
}
