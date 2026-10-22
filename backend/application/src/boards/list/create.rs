use std::sync::Arc;

use domain::boards::{BoardsError, List, ListRepo, Title};
use uuid::Uuid;

pub struct CreateList {
    repo: Arc<dyn ListRepo>,
}

impl CreateList {
    pub fn new(repo: Arc<dyn ListRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        owner_id: Uuid,
        board_id: Uuid,
        name: &str,
    ) -> Result<List, BoardsError> {
        let name = Title::parse(name)?;
        self.repo.create(owner_id, board_id, name).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockListRepo;

    use super::*;

    #[tokio::test]
    async fn creates_a_list_on_the_board() {
        let board_id = Uuid::new_v4();
        let mut repo = MockListRepo::new();
        repo.expect_create()
            .times(1)
            .withf(move |_, board, name| *board == board_id && name.as_str() == "To do")
            .returning(|_, board_id, name| {
                Ok(List {
                    id: Uuid::new_v4(),
                    board_id,
                    name: name.into_string(),
                })
            });

        let result = CreateList::new(Arc::new(repo))
            .execute(Uuid::new_v4(), board_id, " To do ")
            .await;

        assert_eq!(result.expect("creation should succeed").name, "To do");
    }

    #[tokio::test]
    async fn rejects_a_blank_name() {
        let result = CreateList::new(Arc::new(MockListRepo::new()))
            .execute(Uuid::new_v4(), Uuid::new_v4(), "\t")
            .await;

        assert!(matches!(result, Err(BoardsError::Invalid(_))));
    }
}
