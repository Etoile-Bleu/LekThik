use std::sync::Arc;

use domain::boards::{BoardsError, Invitation, InvitationRepo, Member, MemberRepo, Role};
use uuid::Uuid;

use super::access::role_of_actor;

pub struct MembersOverview {
    pub role: Role,
    pub members: Vec<Member>,
    pub invitations: Vec<Invitation>,
}

pub struct ListMembers {
    members: Arc<dyn MemberRepo>,
    invitations: Arc<dyn InvitationRepo>,
}

impl ListMembers {
    pub fn new(members: Arc<dyn MemberRepo>, invitations: Arc<dyn InvitationRepo>) -> Self {
        Self {
            members,
            invitations,
        }
    }

    /// Every member can see who is in the workspace; only managers see the
    /// pending invitations.
    pub async fn execute(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
    ) -> Result<MembersOverview, BoardsError> {
        let role = role_of_actor(self.members.as_ref(), workspace_id, user_id).await?;
        let members = self.members.list(workspace_id).await?;
        let invitations = if role.can_manage() {
            self.invitations
                .list_pending_for_workspace(workspace_id)
                .await?
        } else {
            Vec::new()
        };

        Ok(MembersOverview {
            role,
            members,
            invitations,
        })
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::{MockInvitationRepo, MockMemberRepo};

    use super::*;

    #[tokio::test]
    async fn hides_pending_invitations_from_non_managers() {
        let mut members = MockMemberRepo::new();
        members
            .expect_role_of()
            .returning(|_, _| Ok(Some(Role::Writer)));
        members.expect_list().returning(|_| Ok(Vec::new()));
        let mut invitations = MockInvitationRepo::new();
        invitations.expect_list_pending_for_workspace().times(0);

        let overview = ListMembers::new(Arc::new(members), Arc::new(invitations))
            .execute(Uuid::new_v4(), Uuid::new_v4())
            .await
            .expect("overview");

        assert!(overview.invitations.is_empty());
        assert_eq!(overview.role, Role::Writer);
    }

    #[tokio::test]
    async fn answers_not_found_to_strangers() {
        let mut members = MockMemberRepo::new();
        members.expect_role_of().returning(|_, _| Ok(None));

        let result = ListMembers::new(Arc::new(members), Arc::new(MockInvitationRepo::new()))
            .execute(Uuid::new_v4(), Uuid::new_v4())
            .await;

        assert_eq!(result.err(), Some(BoardsError::NotFound));
    }
}
