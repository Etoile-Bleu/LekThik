use std::sync::Arc;

use domain::boards::{BoardsError, Label, LabelColor, LabelRepo, LabelUpdate, Priority, Title};
use uuid::Uuid;

pub struct UpdateLabel {
    repo: Arc<dyn LabelRepo>,
}

impl UpdateLabel {
    pub fn new(repo: Arc<dyn LabelRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        owner_id: Uuid,
        id: Uuid,
        name: Option<&str>,
        color: Option<&str>,
        priority: Option<&str>,
    ) -> Result<Label, BoardsError> {
        let update = LabelUpdate {
            name: name.map(Title::parse_label_name).transpose()?,
            color: color.map(LabelColor::parse).transpose()?,
            priority: priority.map(Priority::parse).transpose()?,
        };

        self.repo.update(owner_id, id, update).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockLabelRepo;

    use super::*;

    #[tokio::test]
    async fn changes_only_the_priority_when_only_it_is_sent() {
        let mut repo = MockLabelRepo::new();
        repo.expect_update()
            .times(1)
            .withf(|_, _, update| {
                update.name.is_none()
                    && update.color.is_none()
                    && update.priority == Some(Priority::High)
            })
            .returning(|_, id, _| {
                Ok(Label {
                    id,
                    board_id: Uuid::new_v4(),
                    name: "Bug".to_string(),
                    color: LabelColor::Red,
                    priority: Priority::High,
                })
            });

        let result = UpdateLabel::new(Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4(), None, None, Some("high"))
            .await;

        assert_eq!(
            result.expect("update should succeed").priority,
            Priority::High
        );
    }

    #[tokio::test]
    async fn rejects_an_invalid_color_before_reaching_the_repository() {
        let result = UpdateLabel::new(Arc::new(MockLabelRepo::new()))
            .execute(
                Uuid::new_v4(),
                Uuid::new_v4(),
                None,
                Some("chartreuse"),
                None,
            )
            .await;

        assert!(matches!(result, Err(BoardsError::Invalid(_))));
    }
}
