mod common;

use axum::http::StatusCode;
use serde_json::json;
use tower::ServiceExt;

use common::{json_post, login_request, register_request, spawn_app_with_mailer};

const EMAIL: &str = "verify@example.com";
const PASSWORD: &str = "a-strong-password";

#[tokio::test]
async fn registration_emails_a_six_digit_verification_code() -> anyhow::Result<()> {
    let (app, _pool, _container, mailer) = spawn_app_with_mailer().await?;

    let response = app
        .oneshot(register_request(EMAIL, "verify-user", PASSWORD)?)
        .await?;

    assert_eq!(response.status(), StatusCode::CREATED);
    let sent = mailer.sent();
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].to, EMAIL);
    assert_eq!(sent[0].subject, "Confirm your email for LekThik");
    let code = mailer
        .latest_code()
        .ok_or_else(|| anyhow::anyhow!("the email should carry a code"))?;
    assert_eq!(code.len(), 6);
    assert!(code.bytes().all(|byte| byte.is_ascii_digit()));

    Ok(())
}

#[tokio::test]
async fn login_is_forbidden_until_the_email_is_verified() -> anyhow::Result<()> {
    let (app, _pool, _container, _mailer) = spawn_app_with_mailer().await?;
    app.clone()
        .oneshot(register_request(EMAIL, "verify-user", PASSWORD)?)
        .await?;

    let response = app.oneshot(login_request(EMAIL, PASSWORD)?).await?;

    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    Ok(())
}

#[tokio::test]
async fn the_emailed_code_verifies_the_account_and_unlocks_login() -> anyhow::Result<()> {
    let (app, _pool, _container, mailer) = spawn_app_with_mailer().await?;
    app.clone()
        .oneshot(register_request(EMAIL, "verify-user", PASSWORD)?)
        .await?;
    let code = mailer
        .latest_code()
        .ok_or_else(|| anyhow::anyhow!("the email should carry a code"))?;

    let verify_response = app
        .clone()
        .oneshot(json_post(
            "/api/auth/verify-email",
            json!({ "email": EMAIL, "code": code }),
        )?)
        .await?;
    let login_response = app.oneshot(login_request(EMAIL, PASSWORD)?).await?;

    assert_eq!(verify_response.status(), StatusCode::NO_CONTENT);
    assert_eq!(login_response.status(), StatusCode::NO_CONTENT);

    Ok(())
}

#[tokio::test]
async fn a_verification_code_cannot_be_reused() -> anyhow::Result<()> {
    let (app, _pool, _container, mailer) = spawn_app_with_mailer().await?;
    app.clone()
        .oneshot(register_request(EMAIL, "verify-user", PASSWORD)?)
        .await?;
    let code = mailer
        .latest_code()
        .ok_or_else(|| anyhow::anyhow!("the email should carry a code"))?;
    let payload = json!({ "email": EMAIL, "code": code });
    app.clone()
        .oneshot(json_post("/api/auth/verify-email", payload.clone())?)
        .await?;

    let second = app
        .oneshot(json_post("/api/auth/verify-email", payload)?)
        .await?;

    assert_eq!(second.status(), StatusCode::BAD_REQUEST);

    Ok(())
}

#[tokio::test]
async fn a_wrong_code_is_rejected_without_burning_the_real_one() -> anyhow::Result<()> {
    let (app, _pool, _container, mailer) = spawn_app_with_mailer().await?;
    app.clone()
        .oneshot(register_request(EMAIL, "verify-user", PASSWORD)?)
        .await?;
    let code = mailer
        .latest_code()
        .ok_or_else(|| anyhow::anyhow!("the email should carry a code"))?;
    let wrong_code = if code == "000000" { "000001" } else { "000000" };

    let wrong = app
        .clone()
        .oneshot(json_post(
            "/api/auth/verify-email",
            json!({ "email": EMAIL, "code": wrong_code }),
        )?)
        .await?;
    let right = app
        .oneshot(json_post(
            "/api/auth/verify-email",
            json!({ "email": EMAIL, "code": code }),
        )?)
        .await?;

    assert_eq!(wrong.status(), StatusCode::BAD_REQUEST);
    assert_eq!(right.status(), StatusCode::NO_CONTENT);

    Ok(())
}

#[tokio::test]
async fn the_code_is_locked_after_five_wrong_attempts() -> anyhow::Result<()> {
    let (app, _pool, _container, mailer) = spawn_app_with_mailer().await?;
    app.clone()
        .oneshot(register_request(EMAIL, "verify-user", PASSWORD)?)
        .await?;
    let code = mailer
        .latest_code()
        .ok_or_else(|| anyhow::anyhow!("the email should carry a code"))?;
    let wrong_code = if code == "000000" { "000001" } else { "000000" };

    for _ in 0..5 {
        app.clone()
            .oneshot(json_post(
                "/api/auth/verify-email",
                json!({ "email": EMAIL, "code": wrong_code }),
            )?)
            .await?;
    }
    let right_after_lock = app
        .oneshot(json_post(
            "/api/auth/verify-email",
            json!({ "email": EMAIL, "code": code }),
        )?)
        .await?;

    assert_eq!(right_after_lock.status(), StatusCode::BAD_REQUEST);

    Ok(())
}

#[tokio::test]
async fn an_expired_code_is_rejected() -> anyhow::Result<()> {
    let (app, pool, _container, mailer) = spawn_app_with_mailer().await?;
    app.clone()
        .oneshot(register_request(EMAIL, "verify-user", PASSWORD)?)
        .await?;
    let code = mailer
        .latest_code()
        .ok_or_else(|| anyhow::anyhow!("the email should carry a code"))?;
    sqlx::query("UPDATE verification_codes SET expires_at = now() - interval '1 minute'")
        .execute(&pool)
        .await?;

    let response = app
        .oneshot(json_post(
            "/api/auth/verify-email",
            json!({ "email": EMAIL, "code": code }),
        )?)
        .await?;

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);

    Ok(())
}

#[tokio::test]
async fn resending_issues_a_fresh_working_code() -> anyhow::Result<()> {
    let (app, _pool, _container, mailer) = spawn_app_with_mailer().await?;
    app.clone()
        .oneshot(register_request(EMAIL, "verify-user", PASSWORD)?)
        .await?;

    let resend = app
        .clone()
        .oneshot(json_post(
            "/api/auth/resend-verification",
            json!({ "email": EMAIL }),
        )?)
        .await?;
    let code = mailer
        .latest_code()
        .ok_or_else(|| anyhow::anyhow!("the email should carry a code"))?;
    let verify = app
        .oneshot(json_post(
            "/api/auth/verify-email",
            json!({ "email": EMAIL, "code": code }),
        )?)
        .await?;

    assert_eq!(resend.status(), StatusCode::NO_CONTENT);
    assert_eq!(mailer.sent().len(), 2);
    assert_eq!(verify.status(), StatusCode::NO_CONTENT);

    Ok(())
}

#[tokio::test]
async fn resending_for_an_unknown_email_sends_nothing_and_still_answers_204() -> anyhow::Result<()>
{
    let (app, _pool, _container, mailer) = spawn_app_with_mailer().await?;

    let response = app
        .oneshot(json_post(
            "/api/auth/resend-verification",
            json!({ "email": "nobody@example.com" }),
        )?)
        .await?;

    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    assert!(mailer.sent().is_empty());

    Ok(())
}

#[tokio::test]
async fn malformed_verification_requests_are_rejected() -> anyhow::Result<()> {
    let (app, _pool, _container, _mailer) = spawn_app_with_mailer().await?;

    let bad_email = app
        .clone()
        .oneshot(json_post(
            "/api/auth/verify-email",
            json!({ "email": "not-an-email", "code": "123456" }),
        )?)
        .await?;
    let short_code = app
        .clone()
        .oneshot(json_post(
            "/api/auth/verify-email",
            json!({ "email": EMAIL, "code": "123" }),
        )?)
        .await?;
    let bad_resend = app
        .oneshot(json_post(
            "/api/auth/resend-verification",
            json!({ "email": "not-an-email" }),
        )?)
        .await?;

    assert_eq!(bad_email.status(), StatusCode::BAD_REQUEST);
    assert_eq!(short_code.status(), StatusCode::BAD_REQUEST);
    assert_eq!(bad_resend.status(), StatusCode::BAD_REQUEST);

    Ok(())
}
