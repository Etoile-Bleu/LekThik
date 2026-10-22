use std::sync::Arc;

use domain::boards::{BoardsError, Title, Workspace, WorkspaceRepo};
use uuid::Uuid;

pub struct RenameWorkspace {
    repo: Arc<dyn WorkspaceRepo>,
}

impl RenameWorkspace {
    pub fn new(repo: Arc<dyn WorkspaceRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        id: Uuid,
        name: &str,
    ) -> Result<Workspace, BoardsError> {
        let name = Title::parse(name)?;
        self.repo.rename(user_id, id, name).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockWorkspaceRepo;

    use super::*;

    #[tokio::test]
    async fn renames_the_workspace_with_the_trimmed_name() {
        let user_id = Uuid::new_v4();
        let id = Uuid::new_v4();
        let mut repo = MockWorkspaceRepo::new();
        repo.expect_rename()
            .times(1)
            .withf(move |owner, target, name| {
                *owner == user_id && *target == id && name.as_str() == "Renamed"
            })
            .returning(|_, id, name| {
                Ok(Workspace {
                    id,
                    name: name.into_string(),
                    role: domain::boards::Role::Admin,
                })
            });

        let result = RenameWorkspace::new(Arc::new(repo))
            .execute(user_id, id, " Renamed ")
            .await;

        assert_eq!(result.expect("rename should succeed").name, "Renamed");
    }

    #[tokio::test]
    async fn reports_not_found_for_a_workspace_the_owner_does_not_have() {
        let mut repo = MockWorkspaceRepo::new();
        repo.expect_rename()
            .returning(|_, _, _| Err(BoardsError::NotFound));

        let result = RenameWorkspace::new(Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4(), "Anything")
            .await;

        assert_eq!(result, Err(BoardsError::NotFound));
    }
}
