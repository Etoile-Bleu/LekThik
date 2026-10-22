use std::sync::Arc;

use async_trait::async_trait;
use uuid::Uuid;

use super::error::BoardsError;
use super::role::Role;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Member {
    pub user_id: Uuid,
    pub username: String,
    pub email: String,
    pub role: Role,
    pub joined_at: String,
}

#[cfg_attr(feature = "test-utils", mockall::automock)]
#[async_trait]
pub trait MemberRepo: Send + Sync {
    async fn role_of(&self, workspace_id: Uuid, user_id: Uuid)
    -> Result<Option<Role>, BoardsError>;
    async fn list(&self, workspace_id: Uuid) -> Result<Vec<Member>, BoardsError>;
    async fn set_role(
        &self,
        workspace_id: Uuid,
        user_id: Uuid,
        role: Role,
    ) -> Result<Member, BoardsError>;
    async fn remove(&self, workspace_id: Uuid, user_id: Uuid) -> Result<(), BoardsError>;
    async fn workspace_ids_of(&self, user_id: Uuid) -> Result<Vec<Uuid>, BoardsError>;
}

#[async_trait]
impl MemberRepo for Arc<dyn MemberRepo> {
    async fn role_of(
        &self,
        workspace_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<Role>, BoardsError> {
        self.as_ref().role_of(workspace_id, user_id).await
    }

    async fn list(&self, workspace_id: Uuid) -> Result<Vec<Member>, BoardsError> {
        self.as_ref().list(workspace_id).await
    }

    async fn set_role(
        &self,
        workspace_id: Uuid,
        user_id: Uuid,
        role: Role,
    ) -> Result<Member, BoardsError> {
        self.as_ref().set_role(workspace_id, user_id, role).await
    }

    async fn remove(&self, workspace_id: Uuid, user_id: Uuid) -> Result<(), BoardsError> {
        self.as_ref().remove(workspace_id, user_id).await
    }

    async fn workspace_ids_of(&self, user_id: Uuid) -> Result<Vec<Uuid>, BoardsError> {
        self.as_ref().workspace_ids_of(user_id).await
    }
}
