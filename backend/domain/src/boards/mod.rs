mod board;
mod card;
mod error;
mod label;
mod label_style;
mod limits;
mod list;
mod templates;
mod text;
mod workspace;

pub use board::{Board, BoardRepo, BoardSummary, BoardView};
pub use card::{Card, CardRepo, CardSummary, CardUpdate};
pub use error::BoardsError;
pub use label::{Label, LabelRepo, LabelUpdate};
pub use label_style::{LabelColor, Priority};
pub use limits::{
    MAX_BOARDS_PER_WORKSPACE, MAX_CARDS_PER_LIST, MAX_LABELS_PER_BOARD, MAX_LISTS_PER_BOARD,
    MAX_WORKSPACES_PER_USER,
};
pub use list::{List, ListRepo, ListWithCards};
pub use templates::{
    BoardTemplate, TemplateCard, TemplateCategory, TemplateLabel, TemplateList, WorkspaceTemplate,
    board_template, board_templates, workspace_template, workspace_templates,
};
pub use text::{DESCRIPTION_MAX_CHARS, Description, LABEL_NAME_MAX_CHARS, TITLE_MAX_CHARS, Title};
pub use workspace::{Workspace, WorkspaceRepo, WorkspaceWithBoards};

#[cfg(feature = "test-utils")]
pub use board::MockBoardRepo;
#[cfg(feature = "test-utils")]
pub use card::MockCardRepo;
#[cfg(feature = "test-utils")]
pub use label::MockLabelRepo;
#[cfg(feature = "test-utils")]
pub use list::MockListRepo;
#[cfg(feature = "test-utils")]
pub use workspace::MockWorkspaceRepo;
