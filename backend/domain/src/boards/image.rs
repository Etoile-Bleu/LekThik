use async_trait::async_trait;
use uuid::Uuid;

use super::error::BoardsError;

/// The largest file accepted before it is looked at, 5 MB.
pub const IMAGE_MAX_UPLOAD_BYTES: usize = 5 * 1024 * 1024;
/// The longest side of a stored picture, in pixels.
pub const IMAGE_MAX_EDGE: u32 = 2_048;
/// Pictures are decoded in memory, so the number of pixels is capped as well as the file size.
pub const IMAGE_MAX_PIXELS: u64 = 25_000_000;
/// The largest picture kept, after it has been re-encoded.
pub const IMAGE_MAX_STORED_BYTES: usize = 2 * 1024 * 1024;

/// A picture as LekThik keeps it: a fresh JPEG or PNG made from the pixels of an upload, with
/// none of the metadata that came with it (position, device, time, author).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BlockImage {
    pub content_type: String,
    pub width: u32,
    pub height: u32,
    pub bytes: Vec<u8>,
}

/// Turns an upload into a `BlockImage`, or refuses it. Only real PNG, JPEG and WebP pictures are
/// accepted, whatever the file is called or claims to be. Anything else, SVG included, is refused.
#[cfg_attr(feature = "test-utils", mockall::automock)]
#[async_trait]
pub trait ImageSanitizer: Send + Sync {
    async fn sanitize(&self, upload: Vec<u8>) -> Result<BlockImage, BoardsError>;
}

#[cfg_attr(feature = "test-utils", mockall::automock)]
#[async_trait]
pub trait BlockImageRepo: Send + Sync {
    /// Whether this person may put a picture in this block. Asked before a picture is decoded,
    /// so people who may not do it cannot make the server work for nothing.
    async fn check_upload(&self, user_id: Uuid, block_id: Uuid) -> Result<(), BoardsError>;
    /// Keeps the picture of an image block, replacing any earlier one. Returns its version, which
    /// changes with every upload so clients know when to fetch again.
    async fn set(
        &self,
        user_id: Uuid,
        block_id: Uuid,
        image: BlockImage,
    ) -> Result<i64, BoardsError>;
    /// The picture of an image block, for anyone who belongs to its workspace.
    async fn get(&self, user_id: Uuid, block_id: Uuid) -> Result<BlockImage, BoardsError>;
}
