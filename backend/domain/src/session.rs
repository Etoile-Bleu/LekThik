use uuid::Uuid;

#[derive(Debug, thiserror::Error)]
pub enum TokenError {
    #[error("failed to issue token: {0}")]
    Issue(String),
    #[error("invalid or expired token")]
    Invalid,
}

pub trait TokenIssuer: Send + Sync {
    fn issue(&self, user_id: Uuid) -> Result<String, TokenError>;
    fn verify(&self, token: &str) -> Result<Uuid, TokenError>;
}
