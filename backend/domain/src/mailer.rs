use std::sync::Arc;

use async_trait::async_trait;

#[derive(Debug, Clone)]
pub struct EmailMessage {
    pub to: String,
    pub subject: String,
    pub text_body: String,
    pub html_body: String,
}

#[derive(Debug, thiserror::Error)]
pub enum MailerError {
    #[error("failed to deliver email: {0}")]
    Delivery(String),
}

#[cfg_attr(feature = "test-utils", mockall::automock)]
#[async_trait]
pub trait Mailer: Send + Sync {
    async fn send(&self, message: EmailMessage) -> Result<(), MailerError>;
}

#[async_trait]
impl Mailer for Arc<dyn Mailer> {
    async fn send(&self, message: EmailMessage) -> Result<(), MailerError> {
        self.as_ref().send(message).await
    }
}
