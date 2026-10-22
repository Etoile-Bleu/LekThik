use domain::boards::{Board, BoardMember, BoardSummary, BoardView};
use serde::Serialize;
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
            members: view.members.into_iter().map(Into::into).collect(),
            lists: view.lists.into_iter().map(Into::into).collect(),
            labels: view.labels.into_iter().map(Into::into).collect(),
        }
    }
}
