use std::sync::Arc;

use domain::boards::{BoardsError, Card, CardRepo, MAX_BLOCKED_REASON_CHARS};
use uuid::Uuid;

pub struct SetCardBlocked {
    repo: Arc<dyn CardRepo>,
}

impl SetCardBlocked {
    pub fn new(repo: Arc<dyn CardRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        id: Uuid,
        blocked: bool,
        reason: Option<String>,
    ) -> Result<Card, BoardsError> {
        let reason = if blocked {
            match reason.map(|text| text.trim().to_string()) {
                Some(text) if text.is_empty() => None,
                Some(text) if text.chars().count() > MAX_BLOCKED_REASON_CHARS => {
                    return Err(BoardsError::Invalid(format!(
                        "a reason is at most {MAX_BLOCKED_REASON_CHARS} characters"
                    )));
                }
                other => other,
            }
        } else {
            None
        };

        self.repo.set_blocked(user_id, id, blocked, reason).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockCardRepo;

    use super::*;

    fn some_card(blocked_reason: Option<&str>) -> Card {
        Card {
            id: Uuid::new_v4(),
            list_id: Uuid::new_v4(),
            title: "Ship it".to_string(),
            description: String::new(),
            label_ids: Vec::new(),
            assignee_ids: Vec::new(),
            due_date: None,
            created_at: "2026-10-01T00:00:00Z".to_string(),
            list_entered_at: "2026-10-01T00:00:00Z".to_string(),
            blocked_since: blocked_reason.map(|_| "2026-10-02T00:00:00Z".to_string()),
            blocked_reason: blocked_reason.map(str::to_string),
        }
    }

    #[tokio::test]
    async fn blocks_a_card_with_a_trimmed_reason() {
        let id = Uuid::new_v4();
        let mut repo = MockCardRepo::new();
        repo.expect_set_blocked()
            .times(1)
            .withf(move |_, card, blocked, reason| {
                *card == id && *blocked && reason.as_deref() == Some("Waiting on design")
            })
            .returning(|_, _, _, _| Ok(some_card(Some("Waiting on design"))));

        let result = SetCardBlocked::new(Arc::new(repo))
            .execute(
                Uuid::new_v4(),
                id,
                true,
                Some("  Waiting on design  ".to_string()),
            )
            .await;

        assert_eq!(
            result.expect("blocked").blocked_reason.as_deref(),
            Some("Waiting on design")
        );
    }

    #[tokio::test]
    async fn an_empty_reason_is_no_reason() {
        let mut repo = MockCardRepo::new();
        repo.expect_set_blocked()
            .times(1)
            .withf(|_, _, blocked, reason| *blocked && reason.is_none())
            .returning(|_, _, _, _| Ok(some_card(None)));

        let result = SetCardBlocked::new(Arc::new(repo))
            .execute(
                Uuid::new_v4(),
                Uuid::new_v4(),
                true,
                Some("   ".to_string()),
            )
            .await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn refuses_a_reason_that_is_too_long() {
        let too_long = "x".repeat(MAX_BLOCKED_REASON_CHARS + 1);

        let result = SetCardBlocked::new(Arc::new(MockCardRepo::new()))
            .execute(Uuid::new_v4(), Uuid::new_v4(), true, Some(too_long))
            .await;

        assert!(matches!(result, Err(BoardsError::Invalid(_))));
    }

    #[tokio::test]
    async fn clearing_the_flag_drops_any_reason_sent_with_it() {
        let mut repo = MockCardRepo::new();
        repo.expect_set_blocked()
            .times(1)
            .withf(|_, _, blocked, reason| !*blocked && reason.is_none())
            .returning(|_, _, _, _| Ok(some_card(None)));

        let result = SetCardBlocked::new(Arc::new(repo))
            .execute(
                Uuid::new_v4(),
                Uuid::new_v4(),
                false,
                Some("still here".to_string()),
            )
            .await;

        assert!(result.is_ok());
    }
}
