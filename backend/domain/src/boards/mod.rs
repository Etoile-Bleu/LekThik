mod board;
mod card;
mod due_date;
mod error;
mod invitation;
mod label;
mod label_style;
mod limits;
mod list;
mod locator;
mod look;
mod members;
mod role;
mod templates;
mod text;
mod workspace;

pub use board::{Board, BoardMember, BoardRepo, BoardSummary, BoardView};
pub use card::{Card, CardRepo, CardSummary, CardUpdate};
pub use due_date::DueDate;
pub use error::BoardsError;
pub use invitation::{Invitation, InvitationRepo, InvitationStatus, NewInvitation};
pub use label::{Label, LabelRepo, LabelUpdate};
pub use label_style::{LabelColor, Priority};
pub use limits::{
    INVITATION_TTL_SECONDS, MAX_ASSIGNEES_PER_CARD, MAX_BOARDS_PER_WORKSPACE, MAX_CARDS_PER_LIST,
    MAX_LABELS_PER_BOARD, MAX_LISTS_PER_BOARD, MAX_MEMBERS_PER_WORKSPACE,
    MAX_PENDING_INVITATIONS_PER_WORKSPACE, MAX_WORKSPACES_PER_USER,
};
pub use list::{List, ListRepo, ListWithCards};
pub use locator::{Located, Locator, Target};
pub use look::{BoardAccent, BoardBackground, BoardLook};
pub use members::{Member, MemberRepo};
pub use role::Role;
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
pub use invitation::MockInvitationRepo;
#[cfg(feature = "test-utils")]
pub use label::MockLabelRepo;
#[cfg(feature = "test-utils")]
pub use list::MockListRepo;
#[cfg(feature = "test-utils")]
pub use locator::MockLocator;
#[cfg(feature = "test-utils")]
pub use members::MockMemberRepo;
#[cfg(feature = "test-utils")]
pub use workspace::MockWorkspaceRepo;
