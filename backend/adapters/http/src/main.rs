use std::net::SocketAddr;
use std::sync::Arc;

use adapters_db::{
    PgBlockImageRepo, PgBoardRepo, PgCardRepo, PgInvitationRepo, PgLabelRepo, PgListRepo,
    PgLocator, PgMemberRepo, PgPreferencesRepo, PgUserRepo, PgVerificationCodeRepo,
    PgWorkspaceRepo,
};
use adapters_image::ImageCrateSanitizer;
use adapters_mail::{MailSender, SmtpMailer};
use secrecy::SecretString;
use server::events::EventHub;
use server::jwt::JwtTokenIssuer;
use server::state::AppState;
use server::{db, router};

fn required_env(name: &str) -> anyhow::Result<String> {
    std::env::var(name).map_err(|_| anyhow::anyhow!("{name} is not set"))
}

fn env_or(name: &str, default: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default.to_string())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let pool = db::connect().await?;
    println!("connected to postgres");

    let jwt_secret = SecretString::from(required_env("JWT_SECRET")?);

    let mailer = SmtpMailer::new(
        &env_or("SMTP_RELAY", "smtp-relay.brevo.com"),
        required_env("SMTP_USERNAME")?,
        SecretString::from(required_env("SMTP_PASSWORD")?),
        MailSender {
            name: env_or("MAIL_FROM_NAME", "LekThik"),
            email: required_env("MAIL_FROM_EMAIL")?,
        },
    )
    .map_err(|error| anyhow::anyhow!("invalid mailer configuration: {error}"))?;

    let state = AppState {
        user_repo: Arc::new(PgUserRepo::new(pool.clone())),
        verification_code_repo: Arc::new(PgVerificationCodeRepo::new(pool.clone())),
        mailer: Arc::new(mailer),
        token_issuer: Arc::new(JwtTokenIssuer::new(jwt_secret)),
        workspace_repo: Arc::new(PgWorkspaceRepo::new(pool.clone())),
        board_repo: Arc::new(PgBoardRepo::new(pool.clone())),
        list_repo: Arc::new(PgListRepo::new(pool.clone())),
        block_image_repo: Arc::new(PgBlockImageRepo::new(pool.clone())),
        image_sanitizer: Arc::new(ImageCrateSanitizer::new()),
        card_repo: Arc::new(PgCardRepo::new(pool.clone())),
        label_repo: Arc::new(PgLabelRepo::new(pool.clone())),
        member_repo: Arc::new(PgMemberRepo::new(pool.clone())),
        preferences_repo: Arc::new(PgPreferencesRepo::new(pool.clone())),
        invitation_repo: Arc::new(PgInvitationRepo::new(pool.clone())),
        locator: Arc::new(PgLocator::new(pool)),
        events: EventHub::new(),
        app_base_url: env_or("APP_BASE_URL", "http://localhost:5173"),
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
