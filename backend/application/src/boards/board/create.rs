use std::sync::Arc;

use domain::boards::{Board, BoardRepo, BoardsError, Title, board_template};
use uuid::Uuid;

pub struct CreateBoard {
    repo: Arc<dyn BoardRepo>,
}

impl CreateBoard {
    pub fn new(repo: Arc<dyn BoardRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        name: &str,
        template_id: Option<&str>,
    ) -> Result<Board, BoardsError> {
        let name = Title::parse(name)?;
        let template = match template_id {
            None => None,
            Some(id) => Some(
                board_template(id)
                    .ok_or_else(|| BoardsError::Invalid("unknown board template".to_string()))?,
            ),
        };

        self.repo
            .create(user_id, workspace_id, name, template)
            .await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockBoardRepo;

    use super::*;

    fn board_named(workspace_id: Uuid, name: String) -> Board {
        Board {
            id: Uuid::new_v4(),
            workspace_id,
            name,
        }
    }

    #[tokio::test]
    async fn creates_a_blank_board_inside_the_workspace() {
        let user_id = Uuid::new_v4();
        let workspace_id = Uuid::new_v4();
        let mut repo = MockBoardRepo::new();
        repo.expect_create()
            .times(1)
            .withf(move |owner, workspace, name, template| {
                *owner == user_id
                    && *workspace == workspace_id
                    && name.as_str() == "Roadmap"
                    && template.is_none()
            })
            .returning(|_, workspace_id, name, _| {
                Ok(board_named(workspace_id, name.into_string()))
            });

        let result = CreateBoard::new(Arc::new(repo))
            .execute(user_id, workspace_id, "Roadmap", None)
            .await;

        assert_eq!(
            result.expect("creation should succeed").workspace_id,
            workspace_id
        );
    }

    #[tokio::test]
    async fn resolves_the_template_before_calling_the_repository() {
        let mut repo = MockBoardRepo::new();
        repo.expect_create()
            .times(1)
            .withf(|_, _, _, template| template.map(|found| found.id) == Some("sprint-planning"))
            .returning(|_, workspace_id, name, _| {
                Ok(board_named(workspace_id, name.into_string()))
            });

        let result = CreateBoard::new(Arc::new(repo))
            .execute(
                Uuid::new_v4(),
                Uuid::new_v4(),
                "Sprint 12",
                Some("sprint-planning"),
            )
            .await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn rejects_an_unknown_template() {
        let result = CreateBoard::new(Arc::new(MockBoardRepo::new()))
            .execute(Uuid::new_v4(), Uuid::new_v4(), "Board", Some("made-up"))
            .await;

        assert!(matches!(result, Err(BoardsError::Invalid(_))));
    }

    #[tokio::test]
    async fn rejects_an_overlong_name() {
        let result = CreateBoard::new(Arc::new(MockBoardRepo::new()))
            .execute(Uuid::new_v4(), Uuid::new_v4(), &"a".repeat(500), None)
            .await;

        assert!(matches!(result, Err(BoardsError::Invalid(_))));
    }
}
