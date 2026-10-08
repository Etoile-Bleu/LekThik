use domain::{EmailMessage, VerificationPurpose};

use super::verification_code::CODE_TTL_SECONDS;

struct EmailCopy {
    subject: &'static str,
    heading: &'static str,
    intro: &'static str,
    outro: &'static str,
}

fn copy_for(purpose: VerificationPurpose) -> EmailCopy {
    match purpose {
        VerificationPurpose::EmailVerification => EmailCopy {
            subject: "Confirm your email for LekThik",
            heading: "Confirm your email",
            intro: "Welcome to LekThik. Enter this code to verify your email address and finish creating your account.",
            outro: "If you did not create a LekThik account, you can safely ignore this email.",
        },
        VerificationPurpose::PasswordReset => EmailCopy {
            subject: "Reset your LekThik password",
            heading: "Reset your password",
            intro: "We received a request to reset the password of your LekThik account. Enter this code to choose a new one.",
            outro: "If you did not ask for this, ignore this email. Your password will not change.",
        },
    }
}

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

pub(crate) fn build_code_email(
    purpose: VerificationPurpose,
    to: &str,
    username: &str,
    code: &str,
) -> EmailMessage {
    let copy = copy_for(purpose);
    let minutes = CODE_TTL_SECONDS / 60;

    let text_body = format!(
        "Hi {username},\n\n{intro}\n\nYour code: {code}\n\nThis code expires in {minutes} minutes and can only be used once.\n\n{outro}\n\nLekThik, the board that keeps working when the network doesn't.\n",
        intro = copy.intro,
        outro = copy.outro,
    );

    let html_body = format!(
        r##"<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#fafaf8;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your LekThik code is {code}. It expires in {minutes} minutes.</div>
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
                <h1 style="margin:0 0 12px 0;font-family:'Space Grotesk','Helvetica Neue',Arial,sans-serif;font-size:26px;font-weight:600;line-height:1.2;color:#12141c;">{heading}</h1>
                <p style="margin:0 0 4px 0;font-family:'IBM Plex Sans','Helvetica Neue',Arial,sans-serif;font-size:16px;line-height:1.6;color:#12141c;">Hi {username},</p>
                <p style="margin:0 0 24px 0;font-family:'IBM Plex Sans','Helvetica Neue',Arial,sans-serif;font-size:16px;line-height:1.6;color:#4a5568;">{intro}</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="background-color:#eafbf6;border:1px solid #14c9a0;border-radius:12px;padding:20px 12px;">
                      <span style="font-family:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;font-size:36px;font-weight:500;letter-spacing:10px;color:#0b2a22;">{code}</span>
                    </td>
                  </tr>
                </table>
                <p style="margin:20px 0 0 0;font-family:'IBM Plex Sans','Helvetica Neue',Arial,sans-serif;font-size:14px;line-height:1.5;color:#4a5568;">This code expires in {minutes} minutes and can only be used once.</p>
                <hr style="border:none;border-top:1px solid #e4e4de;margin:28px 0 20px 0;">
                <p style="margin:0;font-family:'IBM Plex Sans','Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:1.5;color:#4a5568;">{outro}</p>
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
        heading = copy.heading,
        intro = copy.intro,
        outro = copy.outro,
        username = escape_html(username),
    );

    EmailMessage {
        to: to.to_string(),
        subject: copy.subject.to_string(),
        text_body,
        html_body,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verification_email_carries_the_code_in_both_bodies() {
        let message = build_code_email(
            VerificationPurpose::EmailVerification,
            "person@example.com",
            "person",
            "482913",
        );

        assert_eq!(message.to, "person@example.com");
        assert_eq!(message.subject, "Confirm your email for LekThik");
        assert!(message.text_body.contains("482913"));
        assert!(message.html_body.contains("482913"));
        assert!(message.html_body.contains("Confirm your email"));
    }

    #[test]
    fn reset_email_uses_the_reset_wording() {
        let message = build_code_email(
            VerificationPurpose::PasswordReset,
            "person@example.com",
            "person",
            "000042",
        );

        assert_eq!(message.subject, "Reset your LekThik password");
        assert!(message.html_body.contains("Reset your password"));
        assert!(message.text_body.contains("000042"));
    }

    #[test]
    fn username_is_escaped_in_the_html_body() {
        let message = build_code_email(
            VerificationPurpose::EmailVerification,
            "person@example.com",
            "<script>alert(1)</script>",
            "123456",
        );

        assert!(!message.html_body.contains("<script>"));
        assert!(message.html_body.contains("&lt;script&gt;"));
    }
}
