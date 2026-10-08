use std::net::SocketAddr;
use std::sync::Arc;

use adapters_db::{PgUserRepo, PgVerificationCodeRepo};
use adapters_mail::{BrevoMailer, MailSender};
use secrecy::SecretString;
use server::jwt::JwtTokenIssuer;
use server::state::AppState;
use server::{db, router};

fn required_env(name: &str) -> anyhow::Result<String> {
    std::env::var(name).map_err(|_| anyhow::anyhow!("{name} is not set"))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let pool = db::connect().await?;
    println!("connected to postgres");

    let jwt_secret = SecretString::from(required_env("JWT_SECRET")?);

    let mailer = BrevoMailer::new(
        SecretString::from(required_env("BREVO_API_KEY")?),
        MailSender {
            name: std::env::var("MAIL_FROM_NAME").unwrap_or_else(|_| "LekThik".to_string()),
            email: required_env("MAIL_FROM_EMAIL")?,
        },
    )?;

    let state = AppState {
        user_repo: Arc::new(PgUserRepo::new(pool.clone())),
        verification_code_repo: Arc::new(PgVerificationCodeRepo::new(pool)),
        mailer: Arc::new(mailer),
        token_issuer: Arc::new(JwtTokenIssuer::new(jwt_secret)),
    };

    let app = router::build(state);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080").await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;

    Ok(())
}
