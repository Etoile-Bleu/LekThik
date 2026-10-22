use std::sync::Arc;

use domain::boards::{
    BlockImage, BlockImageRepo, BoardsError, IMAGE_MAX_UPLOAD_BYTES, ImageSanitizer,
};
use uuid::Uuid;

pub struct SetBlockImage {
    sanitizer: Arc<dyn ImageSanitizer>,
    repo: Arc<dyn BlockImageRepo>,
}

impl SetBlockImage {
    pub fn new(sanitizer: Arc<dyn ImageSanitizer>, repo: Arc<dyn BlockImageRepo>) -> Self {
        Self { sanitizer, repo }
    }

    /// Cleans an upload and keeps it as the picture of an image block. Returns the new version.
    pub async fn execute(
        &self,
        user_id: Uuid,
        block_id: Uuid,
        upload: Vec<u8>,
    ) -> Result<i64, BoardsError> {
        if upload.len() > IMAGE_MAX_UPLOAD_BYTES {
            return Err(BoardsError::Invalid(
                "that picture is larger than 5 MB".to_string(),
            ));
        }
        // Who may do this, and whether it makes sense, is settled before any work is done.
        self.repo.check_upload(user_id, block_id).await?;
        let image = self.sanitizer.sanitize(upload).await?;
        self.repo.set(user_id, block_id, image).await
    }
}

pub struct GetBlockImage {
    repo: Arc<dyn BlockImageRepo>,
}

impl GetBlockImage {
    pub fn new(repo: Arc<dyn BlockImageRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(&self, user_id: Uuid, block_id: Uuid) -> Result<BlockImage, BoardsError> {
        self.repo.get(user_id, block_id).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::{MockBlockImageRepo, MockImageSanitizer};

    use super::*;

    fn picture() -> BlockImage {
        BlockImage {
            content_type: "image/jpeg".to_string(),
            width: 10,
            height: 10,
            bytes: vec![1, 2, 3],
        }
    }

    #[tokio::test]
    async fn cleans_the_upload_then_keeps_the_result() {
        let mut sanitizer = MockImageSanitizer::new();
        sanitizer
            .expect_sanitize()
            .times(1)
            .withf(|upload| upload == &vec![9, 9])
            .returning(|_| Ok(picture()));
        let mut repo = MockBlockImageRepo::new();
        repo.expect_check_upload().times(1).returning(|_, _| Ok(()));
        repo.expect_set()
            .times(1)
            .withf(|_, _, image| image.bytes == vec![1, 2, 3])
            .returning(|_, _, _| Ok(42));

        let version = SetBlockImage::new(Arc::new(sanitizer), Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4(), vec![9, 9])
            .await
            .expect("upload should succeed");

        assert_eq!(version, 42);
    }

    #[tokio::test]
    async fn does_no_work_for_someone_who_may_not_upload() {
        let mut repo = MockBlockImageRepo::new();
        repo.expect_check_upload()
            .times(1)
            .returning(|_, _| Err(BoardsError::Forbidden));

        let result = SetBlockImage::new(Arc::new(MockImageSanitizer::new()), Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4(), vec![1])
            .await;

        assert!(matches!(result, Err(BoardsError::Forbidden)));
    }

    #[tokio::test]
    async fn refuses_a_file_that_is_too_large_without_asking_anyone() {
        let result = SetBlockImage::new(
            Arc::new(MockImageSanitizer::new()),
            Arc::new(MockBlockImageRepo::new()),
        )
        .execute(
            Uuid::new_v4(),
            Uuid::new_v4(),
            vec![0; IMAGE_MAX_UPLOAD_BYTES + 1],
        )
        .await;

        assert!(matches!(result, Err(BoardsError::Invalid(_))));
    }

    #[tokio::test]
    async fn keeps_nothing_when_the_picture_is_refused() {
        let mut sanitizer = MockImageSanitizer::new();
        sanitizer
            .expect_sanitize()
            .returning(|_| Err(BoardsError::Invalid("not a picture".to_string())));
        let mut repo = MockBlockImageRepo::new();
        repo.expect_check_upload().returning(|_, _| Ok(()));

        let result = SetBlockImage::new(Arc::new(sanitizer), Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4(), vec![1])
            .await;

        assert!(matches!(result, Err(BoardsError::Invalid(_))));
    }

    #[tokio::test]
    async fn reads_the_picture_for_that_person() {
        let user = Uuid::new_v4();
        let mut repo = MockBlockImageRepo::new();
        repo.expect_get()
            .times(1)
            .withf(move |who, _| *who == user)
            .returning(|_, _| Ok(picture()));

        let image = GetBlockImage::new(Arc::new(repo))
            .execute(user, Uuid::new_v4())
            .await
            .expect("read should succeed");

        assert_eq!(image.width, 10);
    }
}
