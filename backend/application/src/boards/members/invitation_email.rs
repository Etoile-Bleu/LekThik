use domain::EmailMessage;
use domain::boards::{Invitation, Role};

fn escape_html(value: &str) -> String {
    value
        .chars()
        .map(|character| match character {
            '&' => "&amp;".to_string(),
            '<' => "&lt;".to_string(),
            '>' => "&gt;".to_string(),
            '"' => "&quot;".to_string(),
            '\'' => "&#39;".to_string(),
            other => other.to_string(),
        })
        .collect()
}

fn role_blurb(role: Role) -> &'static str {
    match role {
        Role::Reader => "view the boards",
        Role::Writer => "view and edit the boards",
        Role::Admin => "edit the boards and manage the members",
        Role::Owner => "do everything",
    }
}

fn date_of(timestamp: &str) -> &str {
    timestamp.get(..10).unwrap_or(timestamp)
}

pub(crate) fn build_invitation_email(invitation: &Invitation, base_url: &str) -> EmailMessage {
    let link = format!(
        "{}/invitations/{}",
        base_url.trim_end_matches('/'),
        invitation.id
    );
    let blurb = role_blurb(invitation.role);
    let subject = format!(
        "{} invited you to {} on LekThik",
        invitation.invited_by, invitation.workspace_name
    );

    let text_body = format!(
        "{inviter} invited you to join the workspace \"{workspace}\" on LekThik. You will be able to {blurb}.\n\nAccept or decline: {link}\n\nThe invitation expires on {expires}. If you were not expecting it, you can ignore this email.\n\nLekThik, the board that keeps working when the network doesn't.\n",
        inviter = invitation.invited_by,
        workspace = invitation.workspace_name,
        expires = date_of(&invitation.expires_at),
    );

    let html_body = format!(
        r##"<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#fafaf8;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">{inviter} invited you to {workspace}.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fafaf8;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
            <tr>
              <td style="padding:0 4px 20px 4px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="32" height="32" align="center" valign="middle" style="width:32px;height:32px;background-color:#12141c;border-radius:8px;color:#14c9a0;font-family:'Space Grotesk','Helvetica Neue',Arial,sans-serif;font-size:18px;font-weight:700;line-height:32px;">L</td>
                    <td style="padding-left:10px;font-family:'Space Grotesk','Helvetica Neue',Arial,sans-serif;font-size:20px;font-weight:600;color:#12141c;">LekThik</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background-color:#ffffff;border:1px solid #e4e4de;border-radius:16px;padding:36px 32px;">
                <h1 style="margin:0 0 12px 0;font-family:'Space Grotesk','Helvetica Neue',Arial,sans-serif;font-size:26px;font-weight:600;line-height:1.2;color:#12141c;">Join {workspace}</h1>
                <p style="margin:0 0 24px 0;font-family:'IBM Plex Sans','Helvetica Neue',Arial,sans-serif;font-size:16px;line-height:1.6;color:#4a5568;"><strong style="color:#12141c;">{inviter}</strong> invited you to collaborate on the workspace <strong style="color:#12141c;">{workspace}</strong>. You will be able to {blurb}.</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="background-color:#14c9a0;border-radius:10px;">
                      <a href="{link}" style="display:inline-block;padding:14px 26px;font-family:'IBM Plex Sans','Helvetica Neue',Arial,sans-serif;font-size:16px;font-weight:600;color:#0b2a22;text-decoration:none;">Review the invitation</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:20px 0 0 0;font-family:'IBM Plex Sans','Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.5;color:#4a5568;">You can accept or decline once you are signed in with {email}. The invitation expires on {expires}.</p>
                <hr style="border:none;border-top:1px solid #e4e4de;margin:28px 0 20px 0;">
                <p style="margin:0;font-family:'IBM Plex Sans','Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:1.5;color:#4a5568;">If you were not expecting this, you can safely ignore this email. Button not working? Paste this link in your browser: {link}</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 8px 0 8px;font-family:'IBM Plex Sans','Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.5;color:#7b8494;">LekThik, the board that keeps working when the network doesn't.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"##,
        inviter = escape_html(&invitation.invited_by),
        workspace = escape_html(&invitation.workspace_name),
        email = escape_html(&invitation.email),
        expires = date_of(&invitation.expires_at),
        link = escape_html(&link),
    );

    EmailMessage {
        to: invitation.email.clone(),
        subject,
        text_body,
        html_body,
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::InvitationStatus;
    use uuid::Uuid;

    use super::*;

    fn invitation() -> Invitation {
        Invitation {
            id: Uuid::new_v4(),
            workspace_id: Uuid::new_v4(),
            workspace_name: "Team <b>".to_string(),
            email: "marie@example.com".to_string(),
            role: Role::Writer,
            invited_by: "jean".to_string(),
            status: InvitationStatus::Pending,
            created_at: "2026-10-22T10:00:00Z".to_string(),
            expires_at: "2026-10-29T10:00:00Z".to_string(),
            expired: false,
        }
    }

    #[test]
    fn links_to_the_invitation_page_in_both_bodies() {
        let invitation = invitation();
        let message = build_invitation_email(&invitation, "https://app.example.com/");
        let link = format!("https://app.example.com/invitations/{}", invitation.id);

        assert_eq!(message.to, "marie@example.com");
        assert!(message.subject.contains("jean"));
        assert!(message.text_body.contains(&link));
        assert!(message.html_body.contains(&link));
    }

    #[test]
    fn escapes_user_provided_names_in_the_html_body() {
        let message = build_invitation_email(&invitation(), "https://app.example.com");

        assert!(!message.html_body.contains("<b>"));
        assert!(message.html_body.contains("Team &lt;b&gt;"));
    }
}
