mod common;

use axum::http::StatusCode;
use serde_json::Value;
use tower::ServiceExt;

use common::{
    login_request, logout_request, me_request, register_request, session_cookie_from, spawn_app,
};

#[tokio::test]
async fn logs_in_and_reads_the_current_user() -> anyhow::Result<()> {
    let (app, _pool, _container) = spawn_app().await?;
    let register_response = app
        .clone()
        .oneshot(register_request(
            "session@example.com",
            "session-user",
            "a-strong-password",
        )?)
        .await?;
    assert_eq!(register_response.status(), StatusCode::CREATED);

    let login_response = app
        .clone()
        .oneshot(login_request("session@example.com", "a-strong-password")?)
        .await?;
    assert_eq!(login_response.status(), StatusCode::NO_CONTENT);

    let cookie = session_cookie_from(&login_response).expect("login should set a session cookie");

    let me_response = app.oneshot(me_request(Some(&cookie))?).await?;
    assert_eq!(me_response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(me_response.into_body(), usize::MAX).await?;
    let body: Value = serde_json::from_slice(&body)?;
    assert_eq!(body["email"], "session@example.com");
    assert_eq!(body["username"], "session-user");

    Ok(())
}

#[tokio::test]
async fn rejects_me_without_a_session_cookie() -> anyhow::Result<()> {
    let (app, _pool, _container) = spawn_app().await?;

    let response = app.oneshot(me_request(None)?).await?;

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    Ok(())
}

#[tokio::test]
async fn logout_clears_the_session_so_me_is_rejected_afterwards() -> anyhow::Result<()> {
    let (app, _pool, _container) = spawn_app().await?;
    let register_response = app
        .clone()
        .oneshot(register_request(
            "logout@example.com",
            "logout-user",
            "a-strong-password",
        )?)
        .await?;
    assert_eq!(register_response.status(), StatusCode::CREATED);

    let login_response = app
        .clone()
        .oneshot(login_request("logout@example.com", "a-strong-password")?)
        .await?;
    let cookie = session_cookie_from(&login_response).expect("login should set a session cookie");

    let logout_response = app.clone().oneshot(logout_request(&cookie)?).await?;
    assert_eq!(logout_response.status(), StatusCode::NO_CONTENT);

    // The JWT itself is stateless, so the cookie logout clears client-side is
    // what changes here, not the token's validity. A client that resends the
    // now-cleared cookie value (empty) is unauthenticated.
    let cleared_cookie =
        session_cookie_from(&logout_response).expect("logout should clear the cookie");
    let me_response = app.oneshot(me_request(Some(&cleared_cookie))?).await?;

    assert_eq!(me_response.status(), StatusCode::UNAUTHORIZED);

    Ok(())
}
