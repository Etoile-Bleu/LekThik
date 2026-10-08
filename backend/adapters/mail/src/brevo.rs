use std::time::Duration;

use async_trait::async_trait;
use domain::{EmailMessage, Mailer, MailerError};
use secrecy::{ExposeSecret, SecretString};
use serde::Serialize;

const BREVO_SEND_ENDPOINT: &str = "https://api.brevo.com/v3/smtp/email";
const REQUEST_TIMEOUT_SECONDS: u64 = 10;

#[derive(Debug, Clone, Serialize)]
pub struct MailSender {
    pub name: String,
    pub email: String,
}

#[derive(Serialize)]
struct Recipient<'a> {
    email: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SendEmailRequest<'a> {
    sender: &'a MailSender,
    to: [Recipient<'a>; 1],
    subject: &'a str,
    html_content: &'a str,
    text_content: &'a str,
}

pub struct BrevoMailer {
    client: reqwest::Client,
    api_key: SecretString,
    sender: MailSender,
    endpoint: String,
}

impl BrevoMailer {
    pub fn new(api_key: SecretString, sender: MailSender) -> Result<Self, MailerError> {
        Self::with_endpoint(api_key, sender, BREVO_SEND_ENDPOINT.to_string())
    }

    pub fn with_endpoint(
        api_key: SecretString,
        sender: MailSender,
        endpoint: String,
    ) -> Result<Self, MailerError> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECONDS))
            .build()
            .map_err(|error| MailerError::Delivery(error.to_string()))?;

        Ok(Self {
            client,
            api_key,
            sender,
            endpoint,
        })
    }
}

#[async_trait]
impl Mailer for BrevoMailer {
    async fn send(&self, message: EmailMessage) -> Result<(), MailerError> {
        let request = SendEmailRequest {
            sender: &self.sender,
            to: [Recipient { email: &message.to }],
            subject: &message.subject,
            html_content: &message.html_body,
            text_content: &message.text_body,
        };

        let response = self
            .client
            .post(&self.endpoint)
            .header("api-key", self.api_key.expose_secret())
            .header("accept", "application/json")
            .json(&request)
            .send()
            .await
            .map_err(|error| MailerError::Delivery(error.without_url().to_string()))?;

        let status = response.status();
        if status.is_success() {
            return Ok(());
        }

        let detail = response.text().await.unwrap_or_default();
        Err(MailerError::Delivery(format!(
            "brevo answered {status}: {detail}"
        )))
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use wiremock::matchers::{body_partial_json, header, method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

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

    async fn mailer_for(server: &MockServer) -> Result<BrevoMailer, MailerError> {
        BrevoMailer::with_endpoint(
            SecretString::from("test-api-key".to_string()),
            sender(),
            format!("{}/v3/smtp/email", server.uri()),
        )
    }

    #[tokio::test]
    async fn posts_the_message_to_brevo_with_the_api_key() -> anyhow::Result<()> {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/v3/smtp/email"))
            .and(header("api-key", "test-api-key"))
            .and(body_partial_json(json!({
                "sender": { "name": "LekThik", "email": "no-reply@lekthik.dev" },
                "to": [{ "email": "person@example.com" }],
                "subject": "Your code",
                "htmlContent": "<p>123456</p>",
                "textContent": "123456",
            })))
            .respond_with(ResponseTemplate::new(201).set_body_json(json!({ "messageId": "<1>" })))
            .expect(1)
            .mount(&server)
            .await;

        mailer_for(&server).await?.send(message()).await?;

        Ok(())
    }

    #[tokio::test]
    async fn reports_a_delivery_error_when_brevo_rejects_the_request() -> anyhow::Result<()> {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(
                ResponseTemplate::new(401).set_body_json(json!({ "message": "Key not found" })),
            )
            .mount(&server)
            .await;

        let result = mailer_for(&server).await?.send(message()).await;

        let Err(MailerError::Delivery(detail)) = result else {
            anyhow::bail!("expected a delivery error");
        };
        assert!(detail.contains("401"));

        Ok(())
    }
}
