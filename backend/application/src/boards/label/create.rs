use std::sync::Arc;

use domain::boards::{BoardsError, Label, LabelColor, LabelRepo, Priority, Title};
use uuid::Uuid;

pub struct CreateLabel {
    repo: Arc<dyn LabelRepo>,
}

impl CreateLabel {
    pub fn new(repo: Arc<dyn LabelRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        owner_id: Uuid,
        board_id: Uuid,
        name: &str,
        color: &str,
        priority: &str,
    ) -> Result<Label, BoardsError> {
        let name = Title::parse_label_name(name)?;
        let color = LabelColor::parse(color)?;
        let priority = Priority::parse(priority)?;

        self.repo
            .create(owner_id, board_id, name, color, priority)
            .await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockLabelRepo;

    use super::*;

    #[tokio::test]
    async fn creates_a_label_with_a_color_and_a_priority() {
        let board_id = Uuid::new_v4();
        let mut repo = MockLabelRepo::new();
        repo.expect_create()
            .times(1)
            .withf(move |_, board, name, color, priority| {
                *board == board_id
                    && name.as_str() == "Blocker"
                    && *color == LabelColor::Red
                    && *priority == Priority::Urgent
            })
            .returning(|_, board_id, name, color, priority| {
                Ok(Label {
                    id: Uuid::new_v4(),
                    board_id,
                    name: name.into_string(),
                    color,
                    priority,
                })
            });

        let result = CreateLabel::new(Arc::new(repo))
            .execute(Uuid::new_v4(), board_id, " Blocker ", "red", "urgent")
            .await;

        assert_eq!(
            result.expect("creation should succeed").priority,
            Priority::Urgent
        );
    }

    #[tokio::test]
    async fn rejects_a_color_outside_the_palette() {
        let result = CreateLabel::new(Arc::new(MockLabelRepo::new()))
            .execute(Uuid::new_v4(), Uuid::new_v4(), "Bug", "#ff0000", "high")
            .await;

        assert!(matches!(result, Err(BoardsError::Invalid(_))));
    }

    #[tokio::test]
    async fn rejects_an_unknown_priority() {
        let result = CreateLabel::new(Arc::new(MockLabelRepo::new()))
            .execute(Uuid::new_v4(), Uuid::new_v4(), "Bug", "red", "critical")
            .await;

        assert!(matches!(result, Err(BoardsError::Invalid(_))));
    }

    #[tokio::test]
    async fn rejects_a_label_name_over_the_label_limit() {
        let result = CreateLabel::new(Arc::new(MockLabelRepo::new()))
            .execute(
                Uuid::new_v4(),
                Uuid::new_v4(),
                &"a".repeat(41),
                "red",
                "low",
            )
            .await;

        assert!(matches!(result, Err(BoardsError::Invalid(_))));
    }
}
