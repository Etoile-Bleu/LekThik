use domain::boards::{Workspace, WorkspaceWithBoards};
use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

use super::board::BoardSummaryDto;

#[derive(Serialize, ToSchema)]
pub struct WorkspaceResponseDto {
    pub id: Uuid,
    pub name: String,
    /// Role of the signed in user: owner, admin, writer or reader.
    pub role: String,
}

impl From<Workspace> for WorkspaceResponseDto {
    fn from(workspace: Workspace) -> Self {
        Self {
            id: workspace.id,
            name: workspace.name,
            role: workspace.role.as_str().to_string(),
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct WorkspaceWithBoardsDto {
    pub id: Uuid,
    pub name: String,
    pub role: String,
    pub boards: Vec<BoardSummaryDto>,
}

impl From<WorkspaceWithBoards> for WorkspaceWithBoardsDto {
    fn from(entry: WorkspaceWithBoards) -> Self {
        Self {
            id: entry.workspace.id,
            name: entry.workspace.name,
            role: entry.workspace.role.as_str().to_string(),
            boards: entry.boards.into_iter().map(Into::into).collect(),
        }
    }
}
