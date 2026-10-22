use std::collections::HashSet;
use std::sync::Arc;

use domain::boards::{BoardsError, CardRepo, MAX_ASSIGNEES_PER_CARD};
use uuid::Uuid;

pub struct SetCardAssignees {
    repo: Arc<dyn CardRepo>,
}

impl SetCardAssignees {
    pub fn new(repo: Arc<dyn CardRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        id: Uuid,
        assignee_ids: Vec<Uuid>,
    ) -> Result<Vec<Uuid>, BoardsError> {
        let mut seen = HashSet::new();
        let unique: Vec<Uuid> = assignee_ids
            .into_iter()
            .filter(|assignee| seen.insert(*assignee))
            .collect();

        if unique.len() as i64 > MAX_ASSIGNEES_PER_CARD {
            return Err(BoardsError::LimitReached("assignees"));
        }

        self.repo.set_assignees(user_id, id, unique).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockCardRepo;

    use super::*;

    #[tokio::test]
    async fn removes_duplicates_and_keeps_the_order() {
        let first = Uuid::new_v4();
        let second = Uuid::new_v4();
        let mut repo = MockCardRepo::new();
        repo.expect_set_assignees()
            .times(1)
            .withf(move |_, _, ids| ids == &vec![first, second])
            .returning(|_, _, ids| Ok(ids));

        let saved = SetCardAssignees::new(Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4(), vec![first, second, first])
            .await
            .expect("assignees");

        assert_eq!(saved, vec![first, second]);
    }

    #[tokio::test]
    async fn refuses_too_many_assignees_without_touching_storage() {
        let many: Vec<Uuid> = (0..=MAX_ASSIGNEES_PER_CARD)
            .map(|_| Uuid::new_v4())
            .collect();

        let result = SetCardAssignees::new(Arc::new(MockCardRepo::new()))
            .execute(Uuid::new_v4(), Uuid::new_v4(), many)
            .await;

        assert_eq!(result, Err(BoardsError::LimitReached("assignees")));
    }
}
