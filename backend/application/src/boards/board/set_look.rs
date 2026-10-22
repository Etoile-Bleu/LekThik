use std::sync::Arc;

use domain::boards::{BoardAccent, BoardBackground, BoardLook, BoardRepo, BoardsError};
use uuid::Uuid;

pub struct SetBoardLook {
    repo: Arc<dyn BoardRepo>,
}

impl SetBoardLook {
    pub fn new(repo: Arc<dyn BoardRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        id: Uuid,
        background: &str,
        accent: &str,
    ) -> Result<BoardLook, BoardsError> {
        let look = BoardLook {
            background: BoardBackground::parse(background)
                .ok_or_else(|| BoardsError::Invalid("unknown board background".to_string()))?,
            accent: BoardAccent::parse(accent)
                .ok_or_else(|| BoardsError::Invalid("unknown board accent".to_string()))?,
        };

        self.repo.set_look(user_id, id, look).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockBoardRepo;

    use super::*;

    #[tokio::test]
    async fn applies_a_known_look() {
        let mut repo = MockBoardRepo::new();
        repo.expect_set_look()
            .times(1)
            .withf(|_, _, look| {
                look.background == BoardBackground::Sage && look.accent == BoardAccent::Violet
            })
            .returning(|_, _, look| Ok(look));

        let look = SetBoardLook::new(Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4(), "sage", "violet")
            .await
            .expect("look");

        assert_eq!(look.accent, BoardAccent::Violet);
    }

    #[tokio::test]
    async fn rejects_anything_outside_the_presets() {
        let use_case = SetBoardLook::new(Arc::new(MockBoardRepo::new()));

        for (background, accent) in [("#ff0000", "teal"), ("sage", "hotpink"), ("", "")] {
            let result = use_case
                .execute(Uuid::new_v4(), Uuid::new_v4(), background, accent)
                .await;

            assert!(
                matches!(result, Err(BoardsError::Invalid(_))),
                "{background} {accent}"
            );
        }
    }
}
