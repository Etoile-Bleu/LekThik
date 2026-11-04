use std::sync::Arc;

use domain::boards::{Board, BoardRepo, BoardsError};
use uuid::Uuid;

pub struct SetDoneList {
    repo: Arc<dyn BoardRepo>,
}

impl SetDoneList {
    pub fn new(repo: Arc<dyn BoardRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        id: Uuid,
        list_id: Option<Uuid>,
    ) -> Result<Board, BoardsError> {
        self.repo.set_done_list(user_id, id, list_id).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockBoardRepo;

    use super::*;

    #[tokio::test]
    async fn chooses_a_list_as_the_one_that_means_done() {
        let board_id = Uuid::new_v4();
        let list_id = Uuid::new_v4();
        let mut repo = MockBoardRepo::new();
        repo.expect_set_done_list()
            .times(1)
            .withf(move |_, board, list| *board == board_id && *list == Some(list_id))
            .returning(move |_, id, list_id| {
                Ok(Board {
                    id,
                    workspace_id: Uuid::new_v4(),
                    name: "Roadmap".to_string(),
                    done_list_id: list_id,
                })
            });

        let board = SetDoneList::new(Arc::new(repo))
            .execute(Uuid::new_v4(), board_id, Some(list_id))
            .await
            .expect("board");

        assert_eq!(board.done_list_id, Some(list_id));
    }

    #[tokio::test]
    async fn turning_it_off_is_sending_none() {
        let mut repo = MockBoardRepo::new();
        repo.expect_set_done_list()
            .times(1)
            .withf(|_, _, list| list.is_none())
            .returning(|_, id, _| {
                Ok(Board {
                    id,
                    workspace_id: Uuid::new_v4(),
                    name: "Roadmap".to_string(),
                    done_list_id: None,
                })
            });

        let board = SetDoneList::new(Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4(), None)
            .await
            .expect("board");

        assert_eq!(board.done_list_id, None);
    }
}
