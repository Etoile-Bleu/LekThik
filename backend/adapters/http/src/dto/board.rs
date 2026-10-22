use domain::boards::{Board, BoardLook, BoardMember, BoardSummary, BoardView};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use super::label::LabelDto;
use super::list::ListWithCardsDto;

#[derive(Serialize, ToSchema)]
pub struct BoardResponseDto {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub name: String,
}

impl From<Board> for BoardResponseDto {
    fn from(board: Board) -> Self {
        Self {
            id: board.id,
            workspace_id: board.workspace_id,
            name: board.name,
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct BoardSummaryDto {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub name: String,
}

impl From<BoardSummary> for BoardSummaryDto {
    fn from(board: BoardSummary) -> Self {
        Self {
            id: board.id,
            workspace_id: board.workspace_id,
            name: board.name,
        }
    }
}

/// Background tint and accent colour, each one of a fixed set of presets.
#[derive(Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct BoardLookDto {
    /// One of default, mist, sage, sand, blush, lilac, slate, dusk.
    pub background: String,
    /// One of teal, blue, violet, rose, orange, graphite.
    pub accent: String,
}

impl From<BoardLook> for BoardLookDto {
    fn from(look: BoardLook) -> Self {
        Self {
            background: look.background.as_str().to_string(),
            accent: look.accent.as_str().to_string(),
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct BoardMemberDto {
    pub user_id: Uuid,
    pub username: String,
}

impl From<BoardMember> for BoardMemberDto {
    fn from(member: BoardMember) -> Self {
        Self {
            user_id: member.user_id,
            username: member.username,
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct BoardViewDto {
    pub board: BoardResponseDto,
    /// Role of the signed in user in the workspace of this board.
    pub role: String,
    pub look: BoardLookDto,
    /// Everyone in the workspace, for avatars and the assignee picker.
    pub members: Vec<BoardMemberDto>,
    pub lists: Vec<ListWithCardsDto>,
    pub labels: Vec<LabelDto>,
}

impl From<BoardView> for BoardViewDto {
    fn from(view: BoardView) -> Self {
        Self {
            board: view.board.into(),
            role: view.role.as_str().to_string(),
            look: view.look.into(),
            members: view.members.into_iter().map(Into::into).collect(),
            lists: view.lists.into_iter().map(Into::into).collect(),
            labels: view.labels.into_iter().map(Into::into).collect(),
        }
    }
}
