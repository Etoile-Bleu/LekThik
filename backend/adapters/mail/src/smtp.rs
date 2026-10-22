use async_trait::async_trait;
use domain::{EmailMessage, Mailer, MailerError};
use lettre::message::header::ContentType;
use lettre::message::{Mailbox, MultiPart, SinglePart};
use lettre::transport::smtp::authentication::Credentials;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use secrecy::{ExposeSecret, SecretString};

#[derive(Debug, Clone)]
pub struct MailSender {
    pub name: String,
    pub email: String,
}

pub struct SmtpMailer {
    transport: AsyncSmtpTransport<Tokio1Executor>,
    sender: MailSender,
}

impl SmtpMailer {
    pub fn new(
        relay: &str,
        username: String,
        password: SecretString,
        sender: MailSender,
    ) -> Result<Self, MailerError> {
        let transport = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(relay)
            .map_err(|error| MailerError::Delivery(error.to_string()))?
            .credentials(Credentials::new(
                username,
                password.expose_secret().to_string(),
            ))
            .build();

        Ok(Self { transport, sender })
    }
}

fn build_message(sender: &MailSender, message: &EmailMessage) -> Result<Message, MailerError> {
    let from: Mailbox = format!("{} <{}>", sender.name, sender.email)
        .parse()
        .map_err(|error| MailerError::Delivery(format!("invalid sender address: {error}")))?;
    let to: Mailbox = message
        .to
        .parse()
        .map_err(|error| MailerError::Delivery(format!("invalid recipient address: {error}")))?;

    Message::builder()
        .from(from)
        .to(to)
        .subject(&message.subject)
        .multipart(
            MultiPart::alternative()
                .singlepart(
                    SinglePart::builder()
                        .header(ContentType::TEXT_PLAIN)
                        .body(message.text_body.clone()),
                )
                .singlepart(
                    SinglePart::builder()
                        .header(ContentType::TEXT_HTML)
                        .body(message.html_body.clone()),
                ),
        )
        .map_err(|error| MailerError::Delivery(error.to_string()))
}

#[async_trait]
impl Mailer for SmtpMailer {
    async fn send(&self, message: EmailMessage) -> Result<(), MailerError> {
        let email = build_message(&self.sender, &message)?;

        self.transport
            .send(email)
            .await
            .map_err(|error| MailerError::Delivery(error.to_string()))?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sender() -> MailSender {
        MailSender {
            name: "LekThik".to_string(),
            email: "no-reply@lekthik.dev".to_string(),
        }
    }

    fn message() -> EmailMessage {
        EmailMessage {
            to: "person@example.com".to_string(),
            subject: "Your code".to_string(),
            text_body: "123456".to_string(),
            html_body: "<p>123456</p>".to_string(),
        }
    }

    #[test]
    fn builds_a_multipart_message_with_both_bodies() {
        let email = build_message(&sender(), &message()).expect("message should build");
        let raw = String::from_utf8_lossy(&email.formatted()).to_string();

        assert!(raw.contains("Subject: Your code"));
        assert!(raw.contains("To: person@example.com"));
        assert!(raw.contains("From: LekThik <no-reply@lekthik.dev>"));
        assert!(raw.contains("Content-Type: text/plain"));
        assert!(raw.contains("Content-Type: text/html"));
        assert!(raw.contains("<p>123456</p>"));
    }

    #[test]
    fn rejects_an_invalid_recipient_address() {
        let mut invalid = message();
        invalid.to = "not-an-email".to_string();

        assert!(matches!(
            build_message(&sender(), &invalid),
            Err(MailerError::Delivery(_))
        ));
    }

    #[test]
    fn rejects_an_invalid_sender_address() {
        let invalid = MailSender {
            name: "LekThik".to_string(),
            email: "nope".to_string(),
        };

        assert!(matches!(
            build_message(&invalid, &message()),
            Err(MailerError::Delivery(_))
        ));
    }
}
