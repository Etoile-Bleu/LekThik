use domain::boards::{Workspace, WorkspaceWithBoards};
use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

use super::board::BoardSummaryDto;

#[derive(Serialize, ToSchema)]
pub struct WorkspaceResponseDto {
    pub id: Uuid,
    pub name: String,
}

impl From<Workspace> for WorkspaceResponseDto {
    fn from(workspace: Workspace) -> Self {
        Self {
            id: workspace.id,
            name: workspace.name,
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct WorkspaceWithBoardsDto {
    pub id: Uuid,
    pub name: String,
    pub boards: Vec<BoardSummaryDto>,
}

impl From<WorkspaceWithBoards> for WorkspaceWithBoardsDto {
    fn from(entry: WorkspaceWithBoards) -> Self {
        Self {
            id: entry.workspace.id,
            name: entry.workspace.name,
            boards: entry.boards.into_iter().map(Into::into).collect(),
        }
    }
}
