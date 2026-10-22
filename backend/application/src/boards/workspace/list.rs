use std::sync::Arc;

use domain::boards::{BoardsError, WorkspaceRepo, WorkspaceWithBoards};
use uuid::Uuid;

pub struct ListWorkspaces {
    repo: Arc<dyn WorkspaceRepo>,
}

impl ListWorkspaces {
    pub fn new(repo: Arc<dyn WorkspaceRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(&self, owner_id: Uuid) -> Result<Vec<WorkspaceWithBoards>, BoardsError> {
        self.repo.list_with_boards(owner_id).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::{MockWorkspaceRepo, Workspace};

    use super::*;

    #[tokio::test]
    async fn lists_only_what_the_repository_returns_for_the_owner() {
        let owner_id = Uuid::new_v4();
        let workspace = Workspace {
            id: Uuid::new_v4(),
            name: "Team".to_string(),
        };
        let expected = WorkspaceWithBoards {
            workspace: workspace.clone(),
            boards: Vec::new(),
        };

        let mut repo = MockWorkspaceRepo::new();
        let returned = expected.clone();
        repo.expect_list_with_boards()
            .times(1)
            .withf(move |owner| *owner == owner_id)
            .returning(move |_| Ok(vec![returned.clone()]));

        let result = ListWorkspaces::new(Arc::new(repo)).execute(owner_id).await;

        assert_eq!(result, Ok(vec![expected]));
    }
}
