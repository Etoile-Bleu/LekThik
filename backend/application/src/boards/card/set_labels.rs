use std::collections::HashSet;
use std::sync::Arc;

use domain::boards::{BoardsError, CardRepo, MAX_LABELS_PER_BOARD};
use uuid::Uuid;

pub struct SetCardLabels {
    repo: Arc<dyn CardRepo>,
}

impl SetCardLabels {
    pub fn new(repo: Arc<dyn CardRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        owner_id: Uuid,
        id: Uuid,
        label_ids: Vec<Uuid>,
    ) -> Result<Vec<Uuid>, BoardsError> {
        let mut seen = HashSet::new();
        let unique: Vec<Uuid> = label_ids
            .into_iter()
            .filter(|label_id| seen.insert(*label_id))
            .collect();

        if unique.len() as i64 > MAX_LABELS_PER_BOARD {
            return Err(BoardsError::Invalid(
                "a card cannot carry that many labels".to_string(),
            ));
        }

        self.repo.set_labels(owner_id, id, unique).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockCardRepo;

    use super::*;

    #[tokio::test]
    async fn removes_duplicate_label_ids_and_keeps_the_order() {
        let first = Uuid::new_v4();
        let second = Uuid::new_v4();
        let mut repo = MockCardRepo::new();
        repo.expect_set_labels()
            .times(1)
            .withf(move |_, _, ids| ids == &[first, second])
            .returning(|_, _, ids| Ok(ids));

        let result = SetCardLabels::new(Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4(), vec![first, second, first])
            .await;

        assert_eq!(result, Ok(vec![first, second]));
    }

    #[tokio::test]
    async fn rejects_more_labels_than_a_board_can_hold() {
        let too_many: Vec<Uuid> = (0..=MAX_LABELS_PER_BOARD).map(|_| Uuid::new_v4()).collect();

        let result = SetCardLabels::new(Arc::new(MockCardRepo::new()))
            .execute(Uuid::new_v4(), Uuid::new_v4(), too_many)
            .await;

        assert!(matches!(result, Err(BoardsError::Invalid(_))));
    }
}
