use std::sync::Arc;

use domain::{TokenIssuer, UserRepo};

#[derive(Clone)]
pub struct AppState {
    pub user_repo: Arc<dyn UserRepo>,
    pub token_issuer: Arc<dyn TokenIssuer>,
}
