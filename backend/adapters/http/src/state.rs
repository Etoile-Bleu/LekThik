use std::sync::Arc;

use domain::{Mailer, TokenIssuer, UserRepo, VerificationCodeRepo};

pub const SESSION_COOKIE: &str = "session";

#[derive(Clone)]
pub struct AppState {
    pub user_repo: Arc<dyn UserRepo>,
    pub verification_code_repo: Arc<dyn VerificationCodeRepo>,
    pub mailer: Arc<dyn Mailer>,
    pub token_issuer: Arc<dyn TokenIssuer>,
}
