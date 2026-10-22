mod common;

use axum::http::StatusCode;
use serde_json::Value;
use tower::ServiceExt;

use common::{register_request, register_request_without_username, spawn_app};

#[tokio::test]
async fn registers_a_user_and_returns_its_email() -> anyhow::Result<()> {
    let (app, _pool, _container) = spawn_app().await?;

    let response = app
        .oneshot(register_request(
            "person@example.com",
            "person",
            "a-strong-password",
        )?)
        .await?;

    assert_eq!(response.status(), StatusCode::CREATED);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await?;
    let body: Value = serde_json::from_slice(&body)?;
    assert_eq!(body["email"], "person@example.com");
    assert_eq!(body["username"], "person");

    Ok(())
}

#[tokio::test]
async fn rejects_invalid_email() -> anyhow::Result<()> {
    let (app, _pool, _container) = spawn_app().await?;

    let response = app
        .oneshot(register_request(
            "not-an-email",
            "person",
            "a-strong-password",
        )?)
        .await?;

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);

    Ok(())
}

#[tokio::test]
async fn rejects_duplicate_email() -> anyhow::Result<()> {
    let (app, _pool, _container) = spawn_app().await?;

    let first = app
        .clone()
        .oneshot(register_request(
            "duplicate@example.com",
            "first-username",
            "a-strong-password",
        )?)
        .await?;
    assert_eq!(first.status(), StatusCode::CREATED);

    let second = app
        .oneshot(register_request(
            "duplicate@example.com",
            "second-username",
            "a-strong-password",
        )?)
        .await?;
    assert_eq!(second.status(), StatusCode::CONFLICT);

    Ok(())
}

#[tokio::test]
async fn rejects_duplicate_username() -> anyhow::Result<()> {
    let (app, _pool, _container) = spawn_app().await?;

    let first = app
        .clone()
        .oneshot(register_request(
            "first@example.com",
            "duplicate-username",
            "a-strong-password",
        )?)
        .await?;
    assert_eq!(first.status(), StatusCode::CREATED);

    let second = app
        .oneshot(register_request(
            "second@example.com",
            "duplicate-username",
            "a-strong-password",
        )?)
        .await?;
    assert_eq!(second.status(), StatusCode::CONFLICT);

    Ok(())
}

#[tokio::test]
async fn rejects_a_registration_without_a_username() -> anyhow::Result<()> {
    let (app, _pool, _container) = spawn_app().await?;

    let response = app
        .oneshot(register_request_without_username(
            "marie@example.com",
            "a-strong-password",
        )?)
        .await?;

    assert!(
        response.status().is_client_error(),
        "unexpected status {}",
        response.status()
    );

    Ok(())
}

#[tokio::test]
async fn rejects_a_username_that_is_too_short() -> anyhow::Result<()> {
    let (app, _pool, _container) = spawn_app().await?;

    let response = app
        .oneshot(register_request(
            "marie@example.com",
            "ab",
            "a-strong-password",
        )?)
        .await?;

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);

    Ok(())
}
