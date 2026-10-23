use std::sync::Arc;

use domain::boards::{BoardRepo, BoardsError, PanelPlacement, Placement, check_layout};
use uuid::Uuid;

/// One panel and the cells it should cover, as a client sends them.
pub struct PanelPlacementInput {
    pub id: Uuid,
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

pub struct SetBoardLayout {
    repo: Arc<dyn BoardRepo>,
}

impl SetBoardLayout {
    pub fn new(repo: Arc<dyn BoardRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        id: Uuid,
        items: Vec<PanelPlacementInput>,
    ) -> Result<(), BoardsError> {
        let items = items
            .into_iter()
            .map(|item| {
                Ok(PanelPlacement {
                    id: item.id,
                    placement: Placement::parse(item.x, item.y, item.w, item.h)?,
                })
            })
            .collect::<Result<Vec<_>, BoardsError>>()?;
        check_layout(&items)?;

        self.repo.set_layout(user_id, id, items).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockBoardRepo;

    use super::*;

    fn input(w: u32) -> PanelPlacementInput {
        PanelPlacementInput {
            id: Uuid::new_v4(),
            x: 0,
            y: 0,
            w,
            h: 4,
        }
    }

    #[tokio::test]
    async fn stores_a_valid_layout() {
        let mut repo = MockBoardRepo::new();
        repo.expect_set_layout()
            .times(1)
            .withf(|_, _, items| items.len() == 2 && items[0].placement.w == 3)
            .returning(|_, _, _| Ok(()));

        SetBoardLayout::new(Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4(), vec![input(3), input(5)])
            .await
            .expect("a valid layout should be stored");
    }

    #[tokio::test]
    async fn refuses_a_tile_outside_the_grid_without_asking_the_repository() {
        let mut repo = MockBoardRepo::new();
        repo.expect_set_layout().never();

        let result = SetBoardLayout::new(Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4(), vec![input(13)])
            .await;

        assert!(matches!(result, Err(BoardsError::Invalid(_))));
    }

    #[tokio::test]
    async fn refuses_an_empty_layout() {
        let mut repo = MockBoardRepo::new();
        repo.expect_set_layout().never();

        let result = SetBoardLayout::new(Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4(), vec![])
            .await;

        assert!(matches!(result, Err(BoardsError::Invalid(_))));
    }
}
