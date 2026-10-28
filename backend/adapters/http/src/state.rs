use std::sync::Arc;

use domain::boards::{
    BlockImageRepo, BoardRepo, CardRepo, CommentRepo, FieldRepo, ImageSanitizer, InvitationRepo,
    LabelRepo, ListRepo, Locator, MemberRepo, PollRepo, WorkspaceRepo,
};
use domain::{Mailer, PreferencesRepo, TokenIssuer, UserRepo, VerificationCodeRepo};

use crate::events::EventHub;

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
    pub block_image_repo: Arc<dyn BlockImageRepo>,
    pub image_sanitizer: Arc<dyn ImageSanitizer>,
    pub card_repo: Arc<dyn CardRepo>,
    pub comment_repo: Arc<dyn CommentRepo>,
    pub field_repo: Arc<dyn FieldRepo>,
    pub poll_repo: Arc<dyn PollRepo>,
    pub account_repo: Arc<dyn domain::AccountRepo>,
    pub label_repo: Arc<dyn LabelRepo>,
    pub member_repo: Arc<dyn MemberRepo>,
    pub preferences_repo: Arc<dyn PreferencesRepo>,
    pub invitation_repo: Arc<dyn InvitationRepo>,
    pub locator: Arc<dyn Locator>,
    pub events: EventHub,
    /// Public address of the web app, used in links sent by email.
    pub app_base_url: String,
}
