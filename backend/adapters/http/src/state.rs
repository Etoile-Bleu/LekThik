use std::sync::Arc;

use domain::{TokenIssuer, UserRepo};

pub const SESSION_COOKIE: &str = "session";

#[derive(Clone)]
pub struct AppState {
    pub user_repo: Arc<dyn UserRepo>,
    pub token_issuer: Arc<dyn TokenIssuer>,
}
