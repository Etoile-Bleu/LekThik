use std::sync::Arc;

use domain::boards::{
    BoardTemplate, BoardsError, Title, WorkspaceRepo, WorkspaceWithBoards, board_template,
    workspace_template,
};
use uuid::Uuid;

pub struct CreateWorkspace {
    repo: Arc<dyn WorkspaceRepo>,
}

impl CreateWorkspace {
    pub fn new(repo: Arc<dyn WorkspaceRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        name: &str,
        template_id: Option<&str>,
    ) -> Result<WorkspaceWithBoards, BoardsError> {
        let name = Title::parse(name)?;
        let boards = match template_id {
            None => Vec::new(),
            Some(id) => boards_of_template(id)?,
        };

        self.repo.create(user_id, name, boards).await
    }
}

fn boards_of_template(id: &str) -> Result<Vec<&'static BoardTemplate>, BoardsError> {
    let template = workspace_template(id)
        .ok_or_else(|| BoardsError::Invalid("unknown workspace template".to_string()))?;

    template
        .board_ids
        .iter()
        .map(|board_id| {
            board_template(board_id).ok_or_else(|| {
                BoardsError::Repository(format!(
                    "workspace template {} points to the missing board template {board_id}",
                    template.id
                ))
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use domain::boards::{MockWorkspaceRepo, Workspace};

    use super::*;

    fn created(name: String) -> WorkspaceWithBoards {
        WorkspaceWithBoards {
            workspace: Workspace {
                id: Uuid::new_v4(),
                name,
                role: domain::boards::Role::Owner,
            },
            boards: Vec::new(),
        }
    }

    #[tokio::test]
    async fn creates_a_blank_workspace_with_the_trimmed_name_for_the_owner() {
        let user_id = Uuid::new_v4();
        let mut repo = MockWorkspaceRepo::new();
        repo.expect_create()
            .times(1)
            .withf(move |owner, name, boards| {
                *owner == user_id && name.as_str() == "Team" && boards.is_empty()
            })
            .returning(|_, name, _| Ok(created(name.into_string())));

        let result = CreateWorkspace::new(Arc::new(repo))
            .execute(user_id, "  Team ", None)
            .await;

        assert_eq!(
            result.expect("creation should succeed").workspace.name,
            "Team"
        );
    }

    #[tokio::test]
    async fn expands_a_workspace_template_into_its_board_templates() {
        let mut repo = MockWorkspaceRepo::new();
        repo.expect_create()
            .times(1)
            .withf(|_, _, boards| {
                boards.iter().map(|board| board.id).collect::<Vec<_>>()
                    == vec!["sprint-planning", "bug-tracker", "product-roadmap"]
            })
            .returning(|_, name, _| Ok(created(name.into_string())));

        let result = CreateWorkspace::new(Arc::new(repo))
            .execute(Uuid::new_v4(), "Platform", Some("software-team"))
            .await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn rejects_an_unknown_template_without_calling_the_repository() {
        let result = CreateWorkspace::new(Arc::new(MockWorkspaceRepo::new()))
            .execute(Uuid::new_v4(), "Team", Some("made-up"))
            .await;

        assert!(matches!(result, Err(BoardsError::Invalid(_))));
    }

    #[tokio::test]
    async fn rejects_a_blank_name_without_calling_the_repository() {
        let result = CreateWorkspace::new(Arc::new(MockWorkspaceRepo::new()))
            .execute(Uuid::new_v4(), "   ", None)
            .await;

        assert!(matches!(result, Err(BoardsError::Invalid(_))));
    }

    #[tokio::test]
    async fn surfaces_the_workspace_limit() {
        let mut repo = MockWorkspaceRepo::new();
        repo.expect_create()
            .returning(|_, _, _| Err(BoardsError::LimitReached("workspaces")));

        let result = CreateWorkspace::new(Arc::new(repo))
            .execute(Uuid::new_v4(), "One more", None)
            .await;

        assert_eq!(result, Err(BoardsError::LimitReached("workspaces")));
    }
}
