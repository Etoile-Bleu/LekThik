use std::sync::Arc;

use domain::boards::{BoardsError, List, ListRepo, WipLimit};
use uuid::Uuid;

pub struct SetListWipLimit {
    repo: Arc<dyn ListRepo>,
}

impl SetListWipLimit {
    pub fn new(repo: Arc<dyn ListRepo>) -> Self {
        Self { repo }
    }

    /// `None` removes the limit.
    pub async fn execute(
        &self,
        user_id: Uuid,
        id: Uuid,
        limit: Option<u32>,
    ) -> Result<List, BoardsError> {
        let limit = limit.map(WipLimit::parse).transpose()?;
        self.repo.set_wip_limit(user_id, id, limit).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::{BlockConfig, MockListRepo};

    use super::*;

    fn list_with(limit: Option<WipLimit>) -> List {
        List {
            id: Uuid::new_v4(),
            board_id: Uuid::new_v4(),
            name: "Doing".to_string(),
            wip_limit: limit.map(WipLimit::get),
            config: BlockConfig::List,
        }
    }

    #[tokio::test]
    async fn sets_the_limit() {
        let mut repo = MockListRepo::new();
        repo.expect_set_wip_limit()
            .times(1)
            .withf(|_, _, limit| limit.map(WipLimit::get) == Some(4))
            .returning(|_, _, limit| Ok(list_with(limit)));

        let list = SetListWipLimit::new(Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4(), Some(4))
            .await
            .expect("setting a limit should succeed");

        assert_eq!(list.wip_limit, Some(4));
    }

    #[tokio::test]
    async fn removes_the_limit() {
        let mut repo = MockListRepo::new();
        repo.expect_set_wip_limit()
            .times(1)
            .withf(|_, _, limit| limit.is_none())
            .returning(|_, _, limit| Ok(list_with(limit)));

        let list = SetListWipLimit::new(Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4(), None)
            .await
            .expect("removing a limit should succeed");

        assert_eq!(list.wip_limit, None);
    }

    #[tokio::test]
    async fn refuses_a_limit_out_of_range_without_asking_the_repository() {
        for value in [0, 100] {
            let result = SetListWipLimit::new(Arc::new(MockListRepo::new()))
                .execute(Uuid::new_v4(), Uuid::new_v4(), Some(value))
                .await;

            assert!(matches!(result, Err(BoardsError::Invalid(_))));
        }
    }
}
