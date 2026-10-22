use std::sync::Arc;

use domain::boards::{BoardsError, Invitation, InvitationRepo};
use domain::{User, UserRepo};
use uuid::Uuid;

async fn load_user(users: &dyn UserRepo, user_id: Uuid) -> Result<User, BoardsError> {
    users
        .find_by_id(user_id)
        .await
        .map_err(|error| BoardsError::Repository(error.to_string()))?
        .ok_or(BoardsError::NotFound)
}

/// An invitation is only visible to the person it was sent to. Anybody else,
/// signed in or not, gets `NotFound`.
async fn load_own_invitation(
    users: &dyn UserRepo,
    invitations: &dyn InvitationRepo,
    user_id: Uuid,
    invitation_id: Uuid,
) -> Result<(User, Invitation), BoardsError> {
    let user = load_user(users, user_id).await?;
    let invitation = invitations
        .find(invitation_id)
        .await?
        .filter(|invitation| invitation.email == user.email.to_lowercase())
        .ok_or(BoardsError::NotFound)?;

    Ok((user, invitation))
}

pub struct ListMyInvitations {
    users: Arc<dyn UserRepo>,
    invitations: Arc<dyn InvitationRepo>,
}

impl ListMyInvitations {
    pub fn new(users: Arc<dyn UserRepo>, invitations: Arc<dyn InvitationRepo>) -> Self {
        Self { users, invitations }
    }

    pub async fn execute(&self, user_id: Uuid) -> Result<Vec<Invitation>, BoardsError> {
        let user = load_user(self.users.as_ref(), user_id).await?;
        self.invitations
            .list_pending_for_email(&user.email.to_lowercase())
            .await
    }
}

pub struct GetMyInvitation {
    users: Arc<dyn UserRepo>,
    invitations: Arc<dyn InvitationRepo>,
}

impl GetMyInvitation {
    pub fn new(users: Arc<dyn UserRepo>, invitations: Arc<dyn InvitationRepo>) -> Self {
        Self { users, invitations }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        invitation_id: Uuid,
    ) -> Result<Invitation, BoardsError> {
        load_own_invitation(
            self.users.as_ref(),
            self.invitations.as_ref(),
            user_id,
            invitation_id,
        )
        .await
        .map(|(_, invitation)| invitation)
    }
}

pub struct RespondToInvitation {
    users: Arc<dyn UserRepo>,
    invitations: Arc<dyn InvitationRepo>,
}

impl RespondToInvitation {
    pub fn new(users: Arc<dyn UserRepo>, invitations: Arc<dyn InvitationRepo>) -> Self {
        Self { users, invitations }
    }

    pub async fn accept(
        &self,
        user_id: Uuid,
        invitation_id: Uuid,
    ) -> Result<Invitation, BoardsError> {
        let (user, invitation) = self.open_invitation(user_id, invitation_id).await?;
        if !user.email_verified {
            return Err(BoardsError::Forbidden);
        }

        self.invitations.accept(invitation.id, user.id).await
    }

    pub async fn decline(
        &self,
        user_id: Uuid,
        invitation_id: Uuid,
    ) -> Result<Invitation, BoardsError> {
        let (_, invitation) = self.open_invitation(user_id, invitation_id).await?;

        self.invitations.decline(invitation.id).await
    }

    async fn open_invitation(
        &self,
        user_id: Uuid,
        invitation_id: Uuid,
    ) -> Result<(User, Invitation), BoardsError> {
        let (user, invitation) = load_own_invitation(
            self.users.as_ref(),
            self.invitations.as_ref(),
            user_id,
            invitation_id,
        )
        .await?;
        if !invitation.is_open() {
            return Err(BoardsError::Conflict(
                "this invitation is no longer valid".to_string(),
            ));
        }

        Ok((user, invitation))
    }
}

#[cfg(test)]
mod tests {
    use domain::MockUserRepo;
    use domain::boards::{InvitationStatus, MockInvitationRepo, Role};

    use super::*;

    fn user(email: &str, verified: bool) -> User {
        User {
            id: Uuid::new_v4(),
            email: email.to_string(),
            username: "marie".to_string(),
            email_verified: verified,
        }
    }

    fn invitation(email: &str, status: InvitationStatus, expired: bool) -> Invitation {
        Invitation {
            id: Uuid::new_v4(),
            workspace_id: Uuid::new_v4(),
            workspace_name: "Team".to_string(),
            email: email.to_string(),
            role: Role::Writer,
            invited_by: "jean".to_string(),
            status,
            created_at: "2026-10-22T10:00:00Z".to_string(),
            expires_at: "2026-10-29T10:00:00Z".to_string(),
            expired,
        }
    }

    fn respond(
        user: User,
        invitation: Invitation,
        repo: MockInvitationRepo,
    ) -> RespondToInvitation {
        let mut users = MockUserRepo::new();
        users
            .expect_find_by_id()
            .returning(move |_| Ok(Some(user.clone())));
        let mut repo = repo;
        repo.expect_find()
            .returning(move |_| Ok(Some(invitation.clone())));

        RespondToInvitation::new(Arc::new(users), Arc::new(repo))
    }

    #[tokio::test]
    async fn accepting_adds_the_member() {
        let user = user("Marie@example.com", true);
        let mut repo = MockInvitationRepo::new();
        repo.expect_accept().times(1).returning(|id, _| {
            Ok(invitation(
                "marie@example.com",
                InvitationStatus::Accepted,
                false,
            ))
            .map(|mut i| {
                i.id = id;
                i
            })
        });

        let result = respond(
            user.clone(),
            invitation("marie@example.com", InvitationStatus::Pending, false),
            repo,
        )
        .accept(user.id, Uuid::new_v4())
        .await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn an_invitation_for_another_address_is_not_found() {
        let user = user("someone@example.com", true);

        let result = respond(
            user.clone(),
            invitation("marie@example.com", InvitationStatus::Pending, false),
            MockInvitationRepo::new(),
        )
        .accept(user.id, Uuid::new_v4())
        .await;

        assert_eq!(result.err(), Some(BoardsError::NotFound));
    }

    #[tokio::test]
    async fn an_unverified_address_cannot_accept() {
        let user = user("marie@example.com", false);

        let result = respond(
            user.clone(),
            invitation("marie@example.com", InvitationStatus::Pending, false),
            MockInvitationRepo::new(),
        )
        .accept(user.id, Uuid::new_v4())
        .await;

        assert_eq!(result.err(), Some(BoardsError::Forbidden));
    }

    #[tokio::test]
    async fn expired_or_answered_invitations_conflict() {
        for (status, expired) in [
            (InvitationStatus::Pending, true),
            (InvitationStatus::Declined, false),
            (InvitationStatus::Revoked, false),
        ] {
            let user = user("marie@example.com", true);

            let result = respond(
                user.clone(),
                invitation("marie@example.com", status, expired),
                MockInvitationRepo::new(),
            )
            .decline(user.id, Uuid::new_v4())
            .await;

            assert!(matches!(result, Err(BoardsError::Conflict(_))));
        }
    }
}
