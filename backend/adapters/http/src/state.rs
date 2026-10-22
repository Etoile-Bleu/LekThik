use std::sync::Arc;

use domain::boards::{BoardRepo, CardRepo, LabelRepo, ListRepo, WorkspaceRepo};
use domain::{Mailer, TokenIssuer, UserRepo, VerificationCodeRepo};

pub const SESSION_COOKIE: &str = "session";

#[derive(Clone)]
pub struct AppState {
    pub user_repo: Arc<dyn UserRepo>,
    pub verification_code_repo: Arc<dyn VerificationCodeRepo>,
    pub mailer: Arc<dyn Mailer>,
    pub token_issuer: Arc<dyn TokenIssuer>,
    pub workspace_repo: Arc<dyn WorkspaceRepo>,
    pub board_repo: Arc<dyn BoardRepo>,
    pub list_repo: Arc<dyn ListRepo>,
    pub card_repo: Arc<dyn CardRepo>,
    pub label_repo: Arc<dyn LabelRepo>,
}
