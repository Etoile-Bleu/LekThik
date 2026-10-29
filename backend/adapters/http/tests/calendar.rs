mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use common::{
    call, create_workspace_board_list, id_of, signed_in_cookie, spawn_app, with_connect_info,
};
use serde_json::json;
use sqlx::PgPool;
use tower::ServiceExt;

async fn user_id(pool: &PgPool, email: &str) -> anyhow::Result<String> {
    let id: uuid::Uuid = sqlx::query_scalar("SELECT id FROM users WHERE email = $1")
        .bind(email)
        .fetch_one(pool)
        .await?;
    Ok(id.to_string())
}

async fn new_card(
    app: &axum::Router,
    cookie: &str,
    list_id: &str,
    title: &str,
) -> anyhow::Result<String> {
    let (status, card) = call(
        app,
        "POST",
        &format!("/api/lists/{list_id}/cards"),
        Some(cookie),
        Some(json!({ "title": title })),
    )
    .await?;
    anyhow::ensure!(status == StatusCode::CREATED, "card not created");
    id_of(&card)
}

async fn turn_on(app: &axum::Router, cookie: &str) -> anyhow::Result<String> {
    let (status, body) = call(
        app,
        "POST",
        "/api/users/me/calendar-token",
        Some(cookie),
        None,
    )
    .await?;
    anyhow::ensure!(
        status == StatusCode::OK,
        "turning the feed on failed: {body}"
    );
    body["token"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| anyhow::anyhow!("response has no token: {body}"))
}

/// Fetches the feed directly, outside `call`, since the body is plain text, not JSON.
async fn fetch_feed(
    app: &axum::Router,
    token: &str,
) -> anyhow::Result<(StatusCode, String, Option<String>)> {
    let request = Request::builder()
        .method("GET")
        .uri(format!("/api/calendar/{token}.ics"))
        .body(Body::empty())?;
    let response = app.clone().oneshot(with_connect_info(request)).await?;
    let status = response.status();
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let bytes = axum::body::to_bytes(response.into_body(), usize::MAX).await?;
    Ok((
        status,
        String::from_utf8_lossy(&bytes).to_string(),
        content_type,
    ))
}

#[tokio::test]
async fn is_off_until_someone_turns_it_on() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;

    let (status, body) = call(&app, "GET", "/api/users/me/calendar-token", None, None).await?;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "{body}");

    let (status, off) = call(
        &app,
        "GET",
        "/api/users/me/calendar-token",
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::OK, "{off}");
    assert!(off["token"].is_null(), "looking never turns it on: {off}");

    let token = turn_on(&app, &alice).await?;
    assert_eq!(token.len(), 64);

    let (_, on) = call(
        &app,
        "GET",
        "/api/users/me/calendar-token",
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(on["token"], json!(token), "the same token comes back");

    Ok(())
}

#[tokio::test]
async fn regenerating_drops_the_old_address_and_the_feed_needs_no_session() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let old_token = turn_on(&app, &alice).await?;

    let (status, old_feed) = fetch_feed(&app, &old_token).await.map(|(s, b, _)| (s, b))?;
    assert_eq!(status, StatusCode::OK, "{old_feed}");

    let new_token = turn_on(&app, &alice).await?;
    assert_ne!(new_token, old_token);

    let (status, _, _) = fetch_feed(&app, &old_token).await?;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "the old address answers nobody now"
    );

    let (status, _, content_type) = fetch_feed(&app, &new_token).await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        content_type.as_deref(),
        Some("text/calendar; charset=utf-8")
    );

    Ok(())
}

#[tokio::test]
async fn the_feed_lists_cards_with_a_due_date_and_skips_the_rest() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    let alice_id = user_id(&pool, "alice@example.com").await?;

    let dated_id = new_card(&app, &alice, &list_id, "Ship the release").await?;
    call(
        &app,
        "PATCH",
        &format!("/api/cards/{dated_id}"),
        Some(&alice),
        Some(json!({ "due_date": "2026-10-31" })),
    )
    .await?;
    call(
        &app,
        "PUT",
        &format!("/api/cards/{dated_id}/assignees"),
        Some(&alice),
        Some(json!({ "user_ids": [alice_id] })),
    )
    .await?;

    let undated_id = new_card(&app, &alice, &list_id, "Someday maybe").await?;
    call(
        &app,
        "PUT",
        &format!("/api/cards/{undated_id}/assignees"),
        Some(&alice),
        Some(json!({ "user_ids": [alice_id] })),
    )
    .await?;

    let token = turn_on(&app, &alice).await?;

    let (status, feed, _) = fetch_feed(&app, &token).await?;
    assert_eq!(status, StatusCode::OK, "{feed}");
    assert_eq!(
        feed.matches("BEGIN:VEVENT").count(),
        1,
        "only the dated card: {feed}"
    );
    assert!(feed.contains("SUMMARY:Ship the release"));
    assert!(!feed.contains("Someday maybe"));
    assert!(feed.contains("DTSTART;VALUE=DATE:20261031"));
    let unfolded = feed.replace("\r\n ", "");
    assert!(unfolded.contains(&format!(
        "URL:https://app.test/b/{board_id}?card={dated_id}"
    )));

    Ok(())
}

#[tokio::test]
async fn revoking_turns_the_feed_off_and_a_fresh_token_differs() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let token = turn_on(&app, &alice).await?;

    let (status, body) = call(
        &app,
        "DELETE",
        "/api/users/me/calendar-token",
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");

    let (status, _, _) = fetch_feed(&app, &token).await?;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (_, off) = call(
        &app,
        "GET",
        "/api/users/me/calendar-token",
        Some(&alice),
        None,
    )
    .await?;
    assert!(
        off["token"].is_null(),
        "off, and stays off until asked again: {off}"
    );

    let new_token = turn_on(&app, &alice).await?;
    assert_ne!(new_token, token, "turning it back on makes a fresh one");

    Ok(())
}

#[tokio::test]
async fn an_unknown_token_is_a_plain_404() -> anyhow::Result<()> {
    let (app, _pool, _container) = spawn_app().await?;

    let (status, body, _) = fetch_feed(&app, "0".repeat(64).as_str()).await?;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert!(body.is_empty(), "nothing says why: {body}");

    Ok(())
}
