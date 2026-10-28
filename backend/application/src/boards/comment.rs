use std::sync::Arc;

use domain::boards::{BoardsError, Comment, CommentBody, CommentRepo, TimelineItem};
use uuid::Uuid;

pub struct GetTimeline {
    repo: Arc<dyn CommentRepo>,
}

impl GetTimeline {
    pub fn new(repo: Arc<dyn CommentRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        card_id: Uuid,
    ) -> Result<Vec<TimelineItem>, BoardsError> {
        self.repo.timeline(user_id, card_id).await
    }
}

pub struct AddComment {
    repo: Arc<dyn CommentRepo>,
}

impl AddComment {
    pub fn new(repo: Arc<dyn CommentRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        card_id: Uuid,
        body: &str,
    ) -> Result<Comment, BoardsError> {
        let body = CommentBody::parse(body)?;
        self.repo.add(user_id, card_id, body).await
    }
}

pub struct EditComment {
    repo: Arc<dyn CommentRepo>,
}

impl EditComment {
    pub fn new(repo: Arc<dyn CommentRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        card_id: Uuid,
        comment_id: Uuid,
        body: &str,
    ) -> Result<Comment, BoardsError> {
        let body = CommentBody::parse(body)?;
        self.repo.edit(user_id, card_id, comment_id, body).await
    }
}

pub struct DeleteComment {
    repo: Arc<dyn CommentRepo>,
}

impl DeleteComment {
    pub fn new(repo: Arc<dyn CommentRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        card_id: Uuid,
        comment_id: Uuid,
    ) -> Result<(), BoardsError> {
        self.repo.delete(user_id, card_id, comment_id).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockCommentRepo;

    use super::*;

    fn comment(card_id: Uuid, body: &str) -> Comment {
        Comment {
            id: Uuid::new_v4(),
            card_id,
            author: None,
            body: body.to_string(),
            created_at: "2026-10-28T10:00:00Z".to_string(),
            edited_at: None,
        }
    }

    #[tokio::test]
    async fn adds_the_trimmed_text() {
        let card_id = Uuid::new_v4();
        let mut repo = MockCommentRepo::new();
        repo.expect_add()
            .times(1)
            .withf(move |_, card, body| *card == card_id && body.as_str() == "Looks good")
            .returning(|_, card, body| Ok(comment(card, body.as_str())));

        let added = AddComment::new(Arc::new(repo))
            .execute(Uuid::new_v4(), card_id, "  Looks good \r\n")
            .await
            .expect("added");

        assert_eq!(added.body, "Looks good");
    }

    #[tokio::test]
    async fn refuses_an_empty_or_hidden_text_without_asking_storage() {
        for bad in ["", "   ", "bell\u{7}", &"x".repeat(5_001)] {
            let added = AddComment::new(Arc::new(MockCommentRepo::new()))
                .execute(Uuid::new_v4(), Uuid::new_v4(), bad)
                .await;
            let edited = EditComment::new(Arc::new(MockCommentRepo::new()))
                .execute(Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4(), bad)
                .await;

            assert!(matches!(added, Err(BoardsError::Invalid(_))), "{bad:?}");
            assert!(matches!(edited, Err(BoardsError::Invalid(_))), "{bad:?}");
        }
    }

    #[tokio::test]
    async fn passes_the_editor_and_the_ids_to_storage() {
        let (user, card, note) = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
        let mut repo = MockCommentRepo::new();
        repo.expect_edit()
            .times(1)
            .withf(move |u, c, n, body| {
                (*u, *c, *n) == (user, card, note) && body.as_str() == "Fixed"
            })
            .returning(|_, card, _, body| Ok(comment(card, body.as_str())));
        repo.expect_delete()
            .times(1)
            .withf(move |u, c, n| (*u, *c, *n) == (user, card, note))
            .returning(|_, _, _| Ok(()));
        let repo: Arc<dyn CommentRepo> = Arc::new(repo);

        let edited = EditComment::new(repo.clone())
            .execute(user, card, note, "Fixed")
            .await
            .expect("edited");
        DeleteComment::new(repo)
            .execute(user, card, note)
            .await
            .expect("deleted");

        assert_eq!(edited.body, "Fixed");
    }

    #[tokio::test]
    async fn a_timeline_is_whatever_storage_says() {
        let mut repo = MockCommentRepo::new();
        repo.expect_timeline().times(1).returning(|_, _| Ok(vec![]));

        let items = GetTimeline::new(Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4())
            .await
            .expect("timeline");

        assert!(items.is_empty());
    }
}
