use async_trait::async_trait;
use uuid::Uuid;

use super::error::BoardsError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PollCount {
    pub option_id: String,
    pub votes: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PollVoters {
    pub option_id: String,
    pub user_ids: Vec<Uuid>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PollTally {
    pub list_id: Uuid,
    pub counts: Vec<PollCount>,
    pub total: i64,
    pub mine: Option<String>,
    pub voters: Option<Vec<PollVoters>>,
}

#[cfg_attr(feature = "test-utils", mockall::automock)]
#[async_trait]
pub trait PollRepo: Send + Sync {
    async fn vote(&self, user_id: Uuid, list_id: Uuid, option_id: &str) -> Result<(), BoardsError>;
    async fn withdraw(&self, user_id: Uuid, list_id: Uuid) -> Result<(), BoardsError>;
}
