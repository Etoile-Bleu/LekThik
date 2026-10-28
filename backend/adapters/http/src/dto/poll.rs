use domain::boards::{PollCount, PollTally, PollVoters};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Serialize, ToSchema)]
pub struct PollCountDto {
    pub option_id: String,
    pub votes: i64,
}

#[derive(Serialize, ToSchema)]
pub struct PollVotersDto {
    pub option_id: String,
    pub user_ids: Vec<Uuid>,
}

#[derive(Serialize, ToSchema)]
pub struct PollTallyDto {
    pub list_id: Uuid,
    pub counts: Vec<PollCountDto>,
    pub total: i64,
    pub mine: Option<String>,
    #[schema(nullable)]
    pub voters: Option<Vec<PollVotersDto>>,
}

impl From<PollCount> for PollCountDto {
    fn from(count: PollCount) -> Self {
        Self {
            option_id: count.option_id,
            votes: count.votes,
        }
    }
}

impl From<PollVoters> for PollVotersDto {
    fn from(voters: PollVoters) -> Self {
        Self {
            option_id: voters.option_id,
            user_ids: voters.user_ids,
        }
    }
}

impl From<PollTally> for PollTallyDto {
    fn from(tally: PollTally) -> Self {
        Self {
            list_id: tally.list_id,
            counts: tally.counts.into_iter().map(Into::into).collect(),
            total: tally.total,
            mine: tally.mine,
            voters: tally
                .voters
                .map(|voters| voters.into_iter().map(Into::into).collect()),
        }
    }
}

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct VoteRequestDto {
    pub option_id: String,
}
