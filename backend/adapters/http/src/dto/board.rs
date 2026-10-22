use domain::boards::{Board, BoardSummary, BoardView};
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
pub struct BoardViewDto {
    pub board: BoardResponseDto,
    pub lists: Vec<ListWithCardsDto>,
    pub labels: Vec<LabelDto>,
}

impl From<BoardView> for BoardViewDto {
    fn from(view: BoardView) -> Self {
        Self {
            board: view.board.into(),
            lists: view.lists.into_iter().map(Into::into).collect(),
            labels: view.labels.into_iter().map(Into::into).collect(),
        }
    }
}
