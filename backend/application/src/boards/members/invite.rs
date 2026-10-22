use std::sync::Arc;

use domain::Mailer;
use domain::boards::{BoardsError, Invitation, InvitationRepo, MemberRepo, NewInvitation};
use uuid::Uuid;

use super::access::{parse_email, parse_role, role_of_actor};
use super::invitation_email::build_invitation_email;

pub struct InviteMember {
    members: Arc<dyn MemberRepo>,
    invitations: Arc<dyn InvitationRepo>,
    mailer: Arc<dyn Mailer>,
    app_base_url: String,
}

impl InviteMember {
    pub fn new(
        members: Arc<dyn MemberRepo>,
        invitations: Arc<dyn InvitationRepo>,
        mailer: Arc<dyn Mailer>,
        app_base_url: String,
    ) -> Self {
        Self {
            members,
            invitations,
            mailer,
            app_base_url,
        }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        workspace_id: Uuid,
        email: &str,
        role: &str,
    ) -> Result<Invitation, BoardsError> {
        let actor = role_of_actor(self.members.as_ref(), workspace_id, user_id).await?;
        if !actor.can_manage() {
            return Err(BoardsError::Forbidden);
        }

        let email = parse_email(email)?;
        let role = parse_role(role)?;
        if !actor.can_assign(role) {
            return Err(BoardsError::Forbidden);
        }

        let invitation = self
            .invitations
            .create(NewInvitation {
                workspace_id,
                email,
                role,
                invited_by: user_id,
            })
            .await?;

        self.mailer
            .send(build_invitation_email(&invitation, &self.app_base_url))
            .await
            .map_err(|error| BoardsError::Repository(format!("invitation email: {error}")))?;

        Ok(invitation)
    }
}

#[cfg(test)]
mod tests {
    use domain::MockMailer;
    use domain::boards::{InvitationStatus, MockInvitationRepo, MockMemberRepo, Role};

    use super::*;

    fn created(new: NewInvitation) -> Invitation {
        Invitation {
            id: Uuid::new_v4(),
            workspace_id: new.workspace_id,
            workspace_name: "Team".to_string(),
            email: new.email,
            role: new.role,
            invited_by: "jean".to_string(),
            status: InvitationStatus::Pending,
            created_at: "2026-10-22T10:00:00Z".to_string(),
            expires_at: "2026-10-29T10:00:00Z".to_string(),
            expired: false,
        }
    }

    fn use_case(
        actor: Option<Role>,
        invitations: MockInvitationRepo,
        mailer: MockMailer,
    ) -> InviteMember {
        let mut members = MockMemberRepo::new();
        members.expect_role_of().returning(move |_, _| Ok(actor));

        InviteMember::new(
            Arc::new(members),
            Arc::new(invitations),
            Arc::new(mailer),
            "https://app.example.com".to_string(),
        )
    }

    #[tokio::test]
    async fn stores_the_invitation_and_emails_the_invitee() {
        let mut invitations = MockInvitationRepo::new();
        invitations
            .expect_create()
            .times(1)
            .withf(|new| new.email == "marie@example.com" && new.role == Role::Writer)
            .returning(|new| Ok(created(new)));
        let mut mailer = MockMailer::new();
        mailer
            .expect_send()
            .times(1)
            .withf(|message| message.to == "marie@example.com")
            .returning(|_| Ok(()));

        let invitation = use_case(Some(Role::Admin), invitations, mailer)
            .execute(
                Uuid::new_v4(),
                Uuid::new_v4(),
                " Marie@Example.com ",
                "writer",
            )
            .await
            .expect("invitation");

        assert_eq!(invitation.role, Role::Writer);
    }

    #[tokio::test]
    async fn writers_cannot_invite() {
        let result = use_case(
            Some(Role::Writer),
            MockInvitationRepo::new(),
            MockMailer::new(),
        )
        .execute(
            Uuid::new_v4(),
            Uuid::new_v4(),
            "marie@example.com",
            "reader",
        )
        .await;

        assert_eq!(result.err(), Some(BoardsError::Forbidden));
    }

    #[tokio::test]
    async fn admins_cannot_hand_out_the_admin_or_owner_role() {
        for role in ["admin", "owner"] {
            let result = use_case(
                Some(Role::Admin),
                MockInvitationRepo::new(),
                MockMailer::new(),
            )
            .execute(Uuid::new_v4(), Uuid::new_v4(), "marie@example.com", role)
            .await;

            assert_eq!(result.err(), Some(BoardsError::Forbidden), "{role}");
        }
    }

    #[tokio::test]
    async fn strangers_get_not_found() {
        let result = use_case(None, MockInvitationRepo::new(), MockMailer::new())
            .execute(
                Uuid::new_v4(),
                Uuid::new_v4(),
                "marie@example.com",
                "reader",
            )
            .await;

        assert_eq!(result.err(), Some(BoardsError::NotFound));
    }

    #[tokio::test]
    async fn rejects_an_invalid_email_before_touching_storage() {
        let result = use_case(
            Some(Role::Owner),
            MockInvitationRepo::new(),
            MockMailer::new(),
        )
        .execute(Uuid::new_v4(), Uuid::new_v4(), "not-an-email", "reader")
        .await;

        assert!(matches!(result, Err(BoardsError::Invalid(_))));
    }
}
