#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum BoardsError {
    #[error("not found")]
    NotFound,
    #[error("limit reached: {0}")]
    LimitReached(&'static str),
    #[error("invalid input: {0}")]
    Invalid(String),
    #[error("repository error: {0}")]
    Repository(String),
}
