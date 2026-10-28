mod block;
mod board;
mod card;
mod due_date;
mod embed;
mod error;
mod image;
mod invitation;
mod label;
mod label_style;
mod layout;
mod limits;
mod list;
mod locator;
mod look;
mod members;
mod role;
mod templates;
mod text;
mod web_url;
mod workspace;

pub use block::{
    ALT_MAX_CHARS, AgendaConfig, AgendaRange, BLOCK_TITLE_MAX_CHARS, BlockConfig, BlockSize,
    CAPTION_MAX_CHARS, COUNTER_LABEL_MAX_CHARS, CalendarConfig, ChartConfig, ChartSource,
    ChartStyle, CounterConfig, CounterMetric, EmbedConfig, ImageConfig, LinkConfig, ListKind,
    NOTE_MAX_CHARS, NoteConfig, OverdueConfig, ProgressConfig, ProgressStyle, SNIPPET_MAX_CHARS,
    SNIPPET_MAX_LINES, SnippetConfig, SnippetLanguage, TABLE_CELL_MAX_CHARS, TABLE_MAX_BYTES,
    TABLE_MAX_COLUMNS, TABLE_MAX_ROWS, TableConfig,
};
pub use board::{Board, BoardMember, BoardRepo, BoardSummary, BoardView};
pub use card::{AssignedCard, Card, CardRepo, CardSummary, CardUpdate};
pub use due_date::DueDate;
pub use embed::{EmbedProvider, parse_embed_url};
pub use error::BoardsError;
pub use image::{
    BlockImage, BlockImageRepo, IMAGE_MAX_EDGE, IMAGE_MAX_PIXELS, IMAGE_MAX_STORED_BYTES,
    IMAGE_MAX_UPLOAD_BYTES, ImageSanitizer,
};
pub use invitation::{Invitation, InvitationRepo, InvitationStatus, NewInvitation};
pub use label::{Label, LabelRepo, LabelUpdate};
pub use label_style::{LabelColor, Priority};
pub use layout::{
    GRID_COLUMNS, GRID_MAX_ROWS, GRID_MAX_TILE_HEIGHT, PanelPlacement, Placement, check_layout,
};
pub use limits::{
    INVITATION_TTL_SECONDS, MAX_ASSIGNEES_PER_CARD, MAX_BOARDS_PER_WORKSPACE, MAX_CARDS_PER_LIST,
    MAX_LABELS_PER_BOARD, MAX_LISTS_PER_BOARD, MAX_MEMBERS_PER_WORKSPACE,
    MAX_PENDING_INVITATIONS_PER_WORKSPACE, MAX_WIP_LIMIT, MAX_WORKSPACES_PER_USER,
};
pub use list::{List, ListRepo, ListWithCards, WipLimit};
pub use locator::{Located, Locator, Target};
pub use look::{BoardAccent, BoardBackground, BoardLook};
pub use members::{Member, MemberRepo};
pub use role::Role;
pub use templates::{
    BoardTemplate, TemplateCard, TemplateCategory, TemplateLabel, TemplateList, WorkspaceTemplate,
    board_template, board_templates, workspace_template, workspace_templates,
};
pub use text::{DESCRIPTION_MAX_CHARS, Description, LABEL_NAME_MAX_CHARS, TITLE_MAX_CHARS, Title};
pub use web_url::{WEB_URL_MAX_CHARS, parse_link};
pub use workspace::{Workspace, WorkspaceRepo, WorkspaceWithBoards};

#[cfg(feature = "test-utils")]
pub use board::MockBoardRepo;
#[cfg(feature = "test-utils")]
pub use card::MockCardRepo;
#[cfg(feature = "test-utils")]
pub use image::{MockBlockImageRepo, MockImageSanitizer};
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
