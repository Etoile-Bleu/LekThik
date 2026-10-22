use std::sync::Arc;

use domain::boards::{BoardsError, List, ListRepo, Title};
use uuid::Uuid;

pub struct RenameList {
    repo: Arc<dyn ListRepo>,
}

impl RenameList {
    pub fn new(repo: Arc<dyn ListRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(&self, user_id: Uuid, id: Uuid, name: &str) -> Result<List, BoardsError> {
        let name = Title::parse(name)?;
        self.repo.rename(user_id, id, name).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockListRepo;

    use super::*;

    #[tokio::test]
    async fn renames_the_list() {
        let mut repo = MockListRepo::new();
        repo.expect_rename()
            .times(1)
            .withf(|_, _, name| name.as_str() == "Done")
            .returning(|_, id, name| {
                Ok(List {
                    id,
                    board_id: Uuid::new_v4(),
                    name: name.into_string(),
                    wip_limit: None,
                })
            });

        let result = RenameList::new(Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4(), "Done")
            .await;

        assert_eq!(result.expect("rename should succeed").name, "Done");
    }

    #[tokio::test]
    async fn rejects_control_characters() {
        let result = RenameList::new(Arc::new(MockListRepo::new()))
            .execute(Uuid::new_v4(), Uuid::new_v4(), "bad\u{0}name")
            .await;

        assert!(matches!(result, Err(BoardsError::Invalid(_))));
    }
}
