use std::sync::Arc;

use domain::boards::{BoardsError, ListRepo};
use uuid::Uuid;

pub struct DeleteList {
    repo: Arc<dyn ListRepo>,
}

impl DeleteList {
    pub fn new(repo: Arc<dyn ListRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(&self, user_id: Uuid, id: Uuid) -> Result<(), BoardsError> {
        self.repo.delete(user_id, id).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockListRepo;

    use super::*;

    #[tokio::test]
    async fn deletes_the_list_for_the_owner() {
        let user_id = Uuid::new_v4();
        let id = Uuid::new_v4();
        let mut repo = MockListRepo::new();
        repo.expect_delete()
            .times(1)
            .withf(move |owner, target| *owner == user_id && *target == id)
            .returning(|_, _| Ok(()));

        let result = DeleteList::new(Arc::new(repo)).execute(user_id, id).await;

        assert_eq!(result, Ok(()));
    }
}
