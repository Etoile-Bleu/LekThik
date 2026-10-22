use std::sync::Arc;

use domain::boards::{BoardsError, LabelRepo};
use uuid::Uuid;

pub struct DeleteLabel {
    repo: Arc<dyn LabelRepo>,
}

impl DeleteLabel {
    pub fn new(repo: Arc<dyn LabelRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(&self, user_id: Uuid, id: Uuid) -> Result<(), BoardsError> {
        self.repo.delete(user_id, id).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockLabelRepo;

    use super::*;

    #[tokio::test]
    async fn deletes_the_label_for_the_owner() {
        let user_id = Uuid::new_v4();
        let id = Uuid::new_v4();
        let mut repo = MockLabelRepo::new();
        repo.expect_delete()
            .times(1)
            .withf(move |owner, target| *owner == user_id && *target == id)
            .returning(|_, _| Ok(()));

        let result = DeleteLabel::new(Arc::new(repo)).execute(user_id, id).await;

        assert_eq!(result, Ok(()));
    }
}
