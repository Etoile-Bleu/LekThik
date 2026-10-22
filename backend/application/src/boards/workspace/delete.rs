use std::sync::Arc;

use domain::boards::{BoardsError, WorkspaceRepo};
use uuid::Uuid;

pub struct DeleteWorkspace {
    repo: Arc<dyn WorkspaceRepo>,
}

impl DeleteWorkspace {
    pub fn new(repo: Arc<dyn WorkspaceRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(&self, user_id: Uuid, id: Uuid) -> Result<(), BoardsError> {
        self.repo.delete(user_id, id).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockWorkspaceRepo;

    use super::*;

    #[tokio::test]
    async fn deletes_the_workspace_for_the_owner() {
        let user_id = Uuid::new_v4();
        let id = Uuid::new_v4();
        let mut repo = MockWorkspaceRepo::new();
        repo.expect_delete()
            .times(1)
            .withf(move |owner, target| *owner == user_id && *target == id)
            .returning(|_, _| Ok(()));

        let result = DeleteWorkspace::new(Arc::new(repo))
            .execute(user_id, id)
            .await;

        assert_eq!(result, Ok(()));
    }

    #[tokio::test]
    async fn reports_not_found_when_nothing_was_deleted() {
        let mut repo = MockWorkspaceRepo::new();
        repo.expect_delete()
            .returning(|_, _| Err(BoardsError::NotFound));

        let result = DeleteWorkspace::new(Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4())
            .await;

        assert_eq!(result, Err(BoardsError::NotFound));
    }
}
