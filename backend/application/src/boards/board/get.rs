use std::sync::Arc;

use domain::boards::{BoardRepo, BoardView, BoardsError};
use uuid::Uuid;

pub struct GetBoard {
    repo: Arc<dyn BoardRepo>,
}

impl GetBoard {
    pub fn new(repo: Arc<dyn BoardRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(&self, user_id: Uuid, id: Uuid) -> Result<BoardView, BoardsError> {
        self.repo.get_view(user_id, id).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::{Board, MockBoardRepo};

    use super::*;

    #[tokio::test]
    async fn returns_the_board_view_for_the_owner() {
        let user_id = Uuid::new_v4();
        let id = Uuid::new_v4();
        let view = BoardView {
            board: Board {
                id,
                workspace_id: Uuid::new_v4(),
                name: "Roadmap".to_string(),
            },
            role: domain::boards::Role::Owner,
            look: domain::boards::BoardLook::default(),
            members: Vec::new(),
            lists: Vec::new(),
            labels: Vec::new(),
        };

        let mut repo = MockBoardRepo::new();
        let returned = view.clone();
        repo.expect_get_view()
            .times(1)
            .withf(move |owner, target| *owner == user_id && *target == id)
            .returning(move |_, _| Ok(returned.clone()));

        let result = GetBoard::new(Arc::new(repo)).execute(user_id, id).await;

        assert_eq!(result, Ok(view));
    }

    #[tokio::test]
    async fn reports_not_found_for_someone_elses_board() {
        let mut repo = MockBoardRepo::new();
        repo.expect_get_view()
            .returning(|_, _| Err(BoardsError::NotFound));

        let result = GetBoard::new(Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4())
            .await;

        assert_eq!(result, Err(BoardsError::NotFound));
    }
}
