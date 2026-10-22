//! Shared across the integration test binaries in this directory; each binary
//! only calls a subset of these helpers, so unused ones here are expected.
#![allow(dead_code)]

use std::net::SocketAddr;
use std::sync::{Arc, Mutex};

use adapters_db::{
    PgBoardRepo, PgCardRepo, PgInvitationRepo, PgLabelRepo, PgListRepo, PgLocator, PgMemberRepo,
    PgUserRepo, PgVerificationCodeRepo, PgWorkspaceRepo,
};
use async_trait::async_trait;
use axum::body::Body;
use axum::extract::ConnectInfo;
use axum::http::{Request, StatusCode, header};
use domain::{EmailMessage, Mailer, MailerError};
use secrecy::SecretString;
use serde_json::json;
use server::events::EventHub;
use server::jwt::JwtTokenIssuer;
use server::router;
use server::state::AppState;
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use testcontainers_modules::postgres::Postgres;
use testcontainers_modules::testcontainers::runners::AsyncRunner;
use testcontainers_modules::testcontainers::{ContainerAsync, ImageExt};
use tower::ServiceExt;

#[derive(Default)]
pub struct RecordingMailer {
    sent: Mutex<Vec<EmailMessage>>,
}

impl RecordingMailer {
    pub fn sent(&self) -> Vec<EmailMessage> {
        self.sent
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    pub fn latest_code(&self) -> Option<String> {
        self.sent().last().and_then(|message| {
            message
                .text_body
                .lines()
                .find_map(|line| line.strip_prefix("Your code: ").map(str::to_string))
        })
    }
}

#[async_trait]
impl Mailer for RecordingMailer {
    async fn send(&self, message: EmailMessage) -> Result<(), MailerError> {
        self.sent
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .push(message);
        Ok(())
    }
}

pub async fn spawn_app() -> anyhow::Result<(axum::Router, PgPool, ContainerAsync<Postgres>)> {
    let (app, pool, container, _mailer) = spawn_app_with_mailer().await?;
    Ok((app, pool, container))
}

pub async fn spawn_app_with_mailer() -> anyhow::Result<(
    axum::Router,
    PgPool,
    ContainerAsync<Postgres>,
    Arc<RecordingMailer>,
)> {
    let container = Postgres::default().with_tag("16-alpine").start().await?;

    let host = container.get_host().await?;
    let port = container.get_host_port_ipv4(5432).await?;
    let database_url = format!("postgres://postgres:postgres@{host}:{port}/postgres");

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;

    sqlx::raw_sql(include_str!(
        "../../../../migrations/001_create_users_table.sql"
    ))
    .execute(&pool)
    .await?;

    sqlx::raw_sql(include_str!(
        "../../../../migrations/002_add_username_to_users.sql"
    ))
    .execute(&pool)
    .await?;

    sqlx::raw_sql(include_str!(
        "../../../../migrations/003_remove_email_confirmation.sql"
    ))
    .execute(&pool)
    .await?;

    sqlx::raw_sql(include_str!(
        "../../../../migrations/004_add_email_verification_and_codes.sql"
    ))
    .execute(&pool)
    .await?;

    sqlx::raw_sql(include_str!(
        "../../../../migrations/005_create_workspaces_and_boards.sql"
    ))
    .execute(&pool)
    .await?;

    sqlx::raw_sql(include_str!(
        "../../../../migrations/006_create_workspace_collaboration.sql"
    ))
    .execute(&pool)
    .await?;

    let mailer = Arc::new(RecordingMailer::default());

    let state = AppState {
        user_repo: Arc::new(PgUserRepo::new(pool.clone())),
        verification_code_repo: Arc::new(PgVerificationCodeRepo::new(pool.clone())),
        mailer: mailer.clone(),
        token_issuer: Arc::new(JwtTokenIssuer::new(SecretString::from(
            "test-secret".to_string(),
        ))),
        workspace_repo: Arc::new(PgWorkspaceRepo::new(pool.clone())),
        board_repo: Arc::new(PgBoardRepo::new(pool.clone())),
        list_repo: Arc::new(PgListRepo::new(pool.clone())),
        card_repo: Arc::new(PgCardRepo::new(pool.clone())),
        label_repo: Arc::new(PgLabelRepo::new(pool.clone())),
        member_repo: Arc::new(PgMemberRepo::new(pool.clone())),
        invitation_repo: Arc::new(PgInvitationRepo::new(pool.clone())),
        locator: Arc::new(PgLocator::new(pool.clone())),
        events: EventHub::new(),
        app_base_url: "https://app.test".to_string(),
    };

    Ok((router::build(state), pool, container, mailer))
}

pub fn with_connect_info(mut request: Request<Body>) -> Request<Body> {
    request
        .extensions_mut()
        .insert(ConnectInfo(SocketAddr::from(([127, 0, 0, 1], 0))));
    request
}

pub async fn mark_email_verified(pool: &PgPool, email: &str) -> anyhow::Result<()> {
    sqlx::query("UPDATE users SET email_verified_at = now() WHERE email = $1")
        .bind(email)
        .execute(pool)
        .await?;
    Ok(())
}

pub fn json_post(uri: &str, body: serde_json::Value) -> anyhow::Result<Request<Body>> {
    Ok(with_connect_info(
        Request::builder()
            .method("POST")
            .uri(uri)
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(body.to_string()))?,
    ))
}

pub fn register_request_without_username(
    email: &str,
    password: &str,
) -> anyhow::Result<Request<Body>> {
    json_post(
        "/api/users/register",
        json!({ "email": email, "password": password }),
    )
}

pub fn register_request(
    email: &str,
    username: &str,
    password: &str,
) -> anyhow::Result<Request<Body>> {
    Ok(with_connect_info(
        Request::builder()
            .method("POST")
            .uri("/api/users/register")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(
                json!({ "email": email, "username": username, "password": password }).to_string(),
            ))?,
    ))
}

pub fn login_request(email: &str, password: &str) -> anyhow::Result<Request<Body>> {
    Ok(with_connect_info(
        Request::builder()
            .method("POST")
            .uri("/api/auth/login")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(
                json!({ "email": email, "password": password }).to_string(),
            ))?,
    ))
}

pub fn me_request(session_cookie: Option<&str>) -> anyhow::Result<Request<Body>> {
    let mut builder = Request::builder().method("GET").uri("/api/users/me");

    if let Some(cookie) = session_cookie {
        builder = builder.header(header::COOKIE, cookie);
    }

    Ok(with_connect_info(builder.body(Body::empty())?))
}

pub fn logout_request(session_cookie: &str) -> anyhow::Result<Request<Body>> {
    Ok(with_connect_info(
        Request::builder()
            .method("POST")
            .uri("/api/auth/logout")
            .header(header::COOKIE, session_cookie)
            .body(Body::empty())?,
    ))
}

/// Extracts the `session=...` pair from a `Set-Cookie` response header, ready
/// to send back as a `Cookie` request header in a later request.
pub fn session_cookie_from(response: &axum::response::Response) -> Option<String> {
    response
        .headers()
        .get(header::SET_COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .next()
        .map(str::to_string)
}

pub async fn signed_in_cookie(
    app: &axum::Router,
    pool: &PgPool,
    email: &str,
    username: &str,
) -> anyhow::Result<String> {
    let registered = app
        .clone()
        .oneshot(register_request(email, username, "a-strong-password")?)
        .await?;
    anyhow::ensure!(
        registered.status() == StatusCode::CREATED,
        "registration failed"
    );

    mark_email_verified(pool, email).await?;

    let login = app
        .clone()
        .oneshot(login_request(email, "a-strong-password")?)
        .await?;
    anyhow::ensure!(login.status() == StatusCode::NO_CONTENT, "login failed");

    session_cookie_from(&login).ok_or_else(|| anyhow::anyhow!("login set no session cookie"))
}

pub async fn call(
    app: &axum::Router,
    method: &str,
    uri: &str,
    cookie: Option<&str>,
    body: Option<serde_json::Value>,
) -> anyhow::Result<(StatusCode, serde_json::Value)> {
    let mut builder = Request::builder().method(method).uri(uri);

    if let Some(cookie) = cookie {
        builder = builder.header(header::COOKIE, cookie);
    }

    let request = match body {
        Some(body) => builder
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(body.to_string()))?,
        None => builder.body(Body::empty())?,
    };

    let response = app.clone().oneshot(with_connect_info(request)).await?;
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX).await?;
    let value = if bytes.is_empty() {
        serde_json::Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null)
    };

    Ok((status, value))
}

pub fn id_of(value: &serde_json::Value) -> anyhow::Result<String> {
    value["id"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| anyhow::anyhow!("response has no id: {value}"))
}

pub async fn create_workspace_board_list(
    app: &axum::Router,
    cookie: &str,
) -> anyhow::Result<(String, String, String)> {
    let (_, workspace) = call(
        app,
        "POST",
        "/api/workspaces",
        Some(cookie),
        Some(json!({ "name": "Team" })),
    )
    .await?;
    let workspace_id = id_of(&workspace)?;

    let (_, board) = call(
        app,
        "POST",
        &format!("/api/workspaces/{workspace_id}/boards"),
        Some(cookie),
        Some(json!({ "name": "Roadmap" })),
    )
    .await?;
    let board_id = id_of(&board)?;

    let (_, list) = call(
        app,
        "POST",
        &format!("/api/boards/{board_id}/lists"),
        Some(cookie),
        Some(json!({ "name": "To do" })),
    )
    .await?;
    let list_id = id_of(&list)?;

    Ok((workspace_id, board_id, list_id))
}

pub async fn board_view(
    app: &axum::Router,
    cookie: &str,
    board_id: &str,
) -> anyhow::Result<serde_json::Value> {
    let (_, view) = call(
        app,
        "GET",
        &format!("/api/boards/{board_id}"),
        Some(cookie),
        None,
    )
    .await?;
    Ok(view)
}
