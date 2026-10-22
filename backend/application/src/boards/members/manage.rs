use std::sync::Arc;

use domain::boards::{BoardsError, InvitationRepo, Member, MemberRepo, Role};
use uuid::Uuid;

use super::access::{parse_role, role_of_actor};

pub struct ChangeMemberRole {
    members: Arc<dyn MemberRepo>,
}

impl ChangeMemberRole {
    pub fn new(members: Arc<dyn MemberRepo>) -> Self {
        Self { members }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        target_id: Uuid,
        role: &str,
    ) -> Result<Member, BoardsError> {
        let actor = role_of_actor(self.members.as_ref(), workspace_id, user_id).await?;
        if !actor.can_manage() {
            return Err(BoardsError::Forbidden);
        }

        let role = parse_role(role)?;
        let target = self
            .members
            .role_of(workspace_id, target_id)
            .await?
            .ok_or(BoardsError::NotFound)?;
        if !actor.can_manage_member(target) || !actor.can_assign(role) {
            return Err(BoardsError::Forbidden);
        }

        self.members.set_role(workspace_id, target_id, role).await
    }
}

pub struct RemoveMember {
    members: Arc<dyn MemberRepo>,
}

impl RemoveMember {
    pub fn new(members: Arc<dyn MemberRepo>) -> Self {
        Self { members }
    }

    /// Removing yourself is leaving. The owner cannot leave, since a workspace
    /// always keeps its owner.
    pub async fn execute(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        target_id: Uuid,
    ) -> Result<(), BoardsError> {
        let actor = role_of_actor(self.members.as_ref(), workspace_id, user_id).await?;

        if target_id == user_id {
            if actor == Role::Owner {
                return Err(BoardsError::Conflict(
                    "the owner cannot leave the workspace, delete it instead".to_string(),
                ));
            }
        } else {
            let target = self
                .members
                .role_of(workspace_id, target_id)
                .await?
                .ok_or(BoardsError::NotFound)?;
            if !actor.can_manage_member(target) {
                return Err(BoardsError::Forbidden);
            }
        }

        self.members.remove(workspace_id, target_id).await
    }
}

pub struct RevokeInvitation {
    members: Arc<dyn MemberRepo>,
    invitations: Arc<dyn InvitationRepo>,
}

impl RevokeInvitation {
    pub fn new(members: Arc<dyn MemberRepo>, invitations: Arc<dyn InvitationRepo>) -> Self {
        Self {
            members,
            invitations,
        }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        invitation_id: Uuid,
    ) -> Result<(), BoardsError> {
        let actor = role_of_actor(self.members.as_ref(), workspace_id, user_id).await?;
        if !actor.can_manage() {
            return Err(BoardsError::Forbidden);
        }

        self.invitations.revoke(workspace_id, invitation_id).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::{MockInvitationRepo, MockMemberRepo};

    use super::*;

    fn members_with(actor: Role, target: Option<Role>, actor_id: Uuid) -> MockMemberRepo {
        let mut members = MockMemberRepo::new();
        members.expect_role_of().returning(move |_, user| {
            Ok(if user == actor_id {
                Some(actor)
            } else {
                target
            })
        });
        members
    }

    fn member(role: Role) -> Member {
        Member {
            user_id: Uuid::new_v4(),
            username: "marie".to_string(),
            email: "marie@example.com".to_string(),
            role,
            joined_at: "2026-10-22T10:00:00Z".to_string(),
        }
    }

    #[tokio::test]
    async fn an_admin_demotes_a_writer() {
        let actor = Uuid::new_v4();
        let mut members = members_with(Role::Admin, Some(Role::Writer), actor);
        members
            .expect_set_role()
            .times(1)
            .returning(|_, _, role| Ok(member(role)));

        let changed = ChangeMemberRole::new(Arc::new(members))
            .execute(actor, Uuid::new_v4(), Uuid::new_v4(), "reader")
            .await
            .expect("changed");

        assert_eq!(changed.role, Role::Reader);
    }

    #[tokio::test]
    async fn an_admin_cannot_touch_another_admin_or_promote_to_admin() {
        let actor = Uuid::new_v4();

        let peer = ChangeMemberRole::new(Arc::new(members_with(
            Role::Admin,
            Some(Role::Admin),
            actor,
        )))
        .execute(actor, Uuid::new_v4(), Uuid::new_v4(), "reader")
        .await;
        let promotion = ChangeMemberRole::new(Arc::new(members_with(
            Role::Admin,
            Some(Role::Writer),
            actor,
        )))
        .execute(actor, Uuid::new_v4(), Uuid::new_v4(), "admin")
        .await;

        assert_eq!(peer.err(), Some(BoardsError::Forbidden));
        assert_eq!(promotion.err(), Some(BoardsError::Forbidden));
    }

    #[tokio::test]
    async fn the_owner_role_can_never_be_assigned() {
        let actor = Uuid::new_v4();

        let result = ChangeMemberRole::new(Arc::new(members_with(
            Role::Owner,
            Some(Role::Admin),
            actor,
        )))
        .execute(actor, Uuid::new_v4(), Uuid::new_v4(), "owner")
        .await;

        assert_eq!(result.err(), Some(BoardsError::Forbidden));
    }

    #[tokio::test]
    async fn a_member_leaves_the_workspace() {
        let actor = Uuid::new_v4();
        let mut members = members_with(Role::Writer, None, actor);
        members.expect_remove().times(1).returning(|_, _| Ok(()));

        let result = RemoveMember::new(Arc::new(members))
            .execute(actor, Uuid::new_v4(), actor)
            .await;

        assert_eq!(result, Ok(()));
    }

    #[tokio::test]
    async fn the_owner_cannot_leave() {
        let actor = Uuid::new_v4();

        let result = RemoveMember::new(Arc::new(members_with(Role::Owner, None, actor)))
            .execute(actor, Uuid::new_v4(), actor)
            .await;

        assert!(matches!(result, Err(BoardsError::Conflict(_))));
    }

    #[tokio::test]
    async fn writers_cannot_remove_others_and_admins_cannot_remove_the_owner() {
        let actor = Uuid::new_v4();

        let writer = RemoveMember::new(Arc::new(members_with(
            Role::Writer,
            Some(Role::Reader),
            actor,
        )))
        .execute(actor, Uuid::new_v4(), Uuid::new_v4())
        .await;
        let admin = RemoveMember::new(Arc::new(members_with(
            Role::Admin,
            Some(Role::Owner),
            actor,
        )))
        .execute(actor, Uuid::new_v4(), Uuid::new_v4())
        .await;

        assert_eq!(writer, Err(BoardsError::Forbidden));
        assert_eq!(admin, Err(BoardsError::Forbidden));
    }

    #[tokio::test]
    async fn only_managers_revoke_invitations() {
        let actor = Uuid::new_v4();

        let result = RevokeInvitation::new(
            Arc::new(members_with(Role::Writer, None, actor)),
            Arc::new(MockInvitationRepo::new()),
        )
        .execute(actor, Uuid::new_v4(), Uuid::new_v4())
        .await;

        assert_eq!(result, Err(BoardsError::Forbidden));
    }
}
