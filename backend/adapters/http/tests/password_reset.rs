mod common;

use axum::http::StatusCode;
use serde_json::json;
use tower::ServiceExt;

use common::{
    json_post, login_request, mark_email_verified, register_request, spawn_app_with_mailer,
};

const EMAIL: &str = "reset@example.com";
const OLD_PASSWORD: &str = "the-old-password";
const NEW_PASSWORD: &str = "the-brand-new-password";

#[tokio::test]
async fn forgot_password_for_an_unknown_email_sends_nothing_and_answers_204() -> anyhow::Result<()>
{
    let (app, _pool, _container, mailer) = spawn_app_with_mailer().await?;

    let response = app
        .oneshot(json_post(
            "/api/auth/forgot-password",
            json!({ "email": "nobody@example.com" }),
        )?)
        .await?;

    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    assert!(mailer.sent().is_empty());

    Ok(())
}

#[tokio::test]
async fn forgot_password_rejects_a_malformed_email() -> anyhow::Result<()> {
    let (app, _pool, _container, _mailer) = spawn_app_with_mailer().await?;

    let response = app
        .oneshot(json_post(
            "/api/auth/forgot-password",
            json!({ "email": "not-an-email" }),
        )?)
        .await?;

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);

    Ok(())
}

#[tokio::test]
async fn the_emailed_code_resets_the_password() -> anyhow::Result<()> {
    let (app, pool, _container, mailer) = spawn_app_with_mailer().await?;
    app.clone()
        .oneshot(register_request(EMAIL, "reset-user", OLD_PASSWORD)?)
        .await?;
    mark_email_verified(&pool, EMAIL).await?;

    let forgot = app
        .clone()
        .oneshot(json_post(
            "/api/auth/forgot-password",
            json!({ "email": EMAIL }),
        )?)
        .await?;
    let reset_mail = mailer
        .sent()
        .into_iter()
        .find(|message| message.subject == "Reset your LekThik password")
        .ok_or_else(|| anyhow::anyhow!("a reset email should have been sent"))?;
    let code = mailer
        .latest_code()
        .ok_or_else(|| anyhow::anyhow!("the email should carry a code"))?;
    let reset = app
        .clone()
        .oneshot(json_post(
            "/api/auth/reset-password",
            json!({ "email": EMAIL, "code": code, "password": NEW_PASSWORD }),
        )?)
        .await?;
    let login_new = app
        .clone()
        .oneshot(login_request(EMAIL, NEW_PASSWORD)?)
        .await?;
    let login_old = app.oneshot(login_request(EMAIL, OLD_PASSWORD)?).await?;

    assert_eq!(forgot.status(), StatusCode::NO_CONTENT);
    assert_eq!(reset_mail.to, EMAIL);
    assert_eq!(reset.status(), StatusCode::NO_CONTENT);
    assert_eq!(login_new.status(), StatusCode::NO_CONTENT);
    assert_eq!(login_old.status(), StatusCode::UNAUTHORIZED);

    Ok(())
}

#[tokio::test]
async fn a_wrong_code_leaves_the_password_untouched() -> anyhow::Result<()> {
    let (app, pool, _container, mailer) = spawn_app_with_mailer().await?;
    app.clone()
        .oneshot(register_request(EMAIL, "reset-user", OLD_PASSWORD)?)
        .await?;
    mark_email_verified(&pool, EMAIL).await?;
    app.clone()
        .oneshot(json_post(
            "/api/auth/forgot-password",
            json!({ "email": EMAIL }),
        )?)
        .await?;
    let code = mailer
        .latest_code()
        .ok_or_else(|| anyhow::anyhow!("the email should carry a code"))?;
    let wrong_code = if code == "000000" { "000001" } else { "000000" };

    let reset = app
        .clone()
        .oneshot(json_post(
            "/api/auth/reset-password",
            json!({ "email": EMAIL, "code": wrong_code, "password": NEW_PASSWORD }),
        )?)
        .await?;
    let login_old = app.oneshot(login_request(EMAIL, OLD_PASSWORD)?).await?;

    assert_eq!(reset.status(), StatusCode::BAD_REQUEST);
    assert_eq!(login_old.status(), StatusCode::NO_CONTENT);

    Ok(())
}

#[tokio::test]
async fn a_reset_code_works_only_once() -> anyhow::Result<()> {
    let (app, pool, _container, mailer) = spawn_app_with_mailer().await?;
    app.clone()
        .oneshot(register_request(EMAIL, "reset-user", OLD_PASSWORD)?)
        .await?;
    mark_email_verified(&pool, EMAIL).await?;
    app.clone()
        .oneshot(json_post(
            "/api/auth/forgot-password",
            json!({ "email": EMAIL }),
        )?)
        .await?;
    let code = mailer
        .latest_code()
        .ok_or_else(|| anyhow::anyhow!("the email should carry a code"))?;
    let payload = json!({ "email": EMAIL, "code": code, "password": NEW_PASSWORD });

    let first = app
        .clone()
        .oneshot(json_post("/api/auth/reset-password", payload.clone())?)
        .await?;
    let second = app
        .oneshot(json_post("/api/auth/reset-password", payload)?)
        .await?;

    assert_eq!(first.status(), StatusCode::NO_CONTENT);
    assert_eq!(second.status(), StatusCode::BAD_REQUEST);

    Ok(())
}

#[tokio::test]
async fn an_expired_reset_code_is_rejected() -> anyhow::Result<()> {
    let (app, pool, _container, mailer) = spawn_app_with_mailer().await?;
    app.clone()
        .oneshot(register_request(EMAIL, "reset-user", OLD_PASSWORD)?)
        .await?;
    mark_email_verified(&pool, EMAIL).await?;
    app.clone()
        .oneshot(json_post(
            "/api/auth/forgot-password",
            json!({ "email": EMAIL }),
        )?)
        .await?;
    let code = mailer
        .latest_code()
        .ok_or_else(|| anyhow::anyhow!("the email should carry a code"))?;
    sqlx::query(
        "UPDATE verification_codes SET expires_at = now() - interval '1 minute' \
            WHERE purpose = 'password_reset'",
    )
    .execute(&pool)
    .await?;

    let response = app
        .oneshot(json_post(
            "/api/auth/reset-password",
            json!({ "email": EMAIL, "code": code, "password": NEW_PASSWORD }),
        )?)
        .await?;

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);

    Ok(())
}

#[tokio::test]
async fn a_verification_code_cannot_reset_a_password() -> anyhow::Result<()> {
    let (app, _pool, _container, mailer) = spawn_app_with_mailer().await?;
    app.clone()
        .oneshot(register_request(EMAIL, "reset-user", OLD_PASSWORD)?)
        .await?;
    let verification_code = mailer
        .latest_code()
        .ok_or_else(|| anyhow::anyhow!("the email should carry a code"))?;

    let response = app
        .oneshot(json_post(
            "/api/auth/reset-password",
            json!({ "email": EMAIL, "code": verification_code, "password": NEW_PASSWORD }),
        )?)
        .await?;

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);

    Ok(())
}

#[tokio::test]
async fn reset_password_rejects_a_short_password() -> anyhow::Result<()> {
    let (app, _pool, _container, _mailer) = spawn_app_with_mailer().await?;

    let response = app
        .oneshot(json_post(
            "/api/auth/reset-password",
            json!({ "email": EMAIL, "code": "123456", "password": "short" }),
        )?)
        .await?;

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);

    Ok(())
}
