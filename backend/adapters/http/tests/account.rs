mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use common::{
    board_view, call, create_workspace_board_list, id_of, login_request, signed_in_cookie,
    spawn_app, with_connect_info,
};
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;

async fn join(pool: &PgPool, workspace_id: &str, email: &str, role: &str) -> anyhow::Result<()> {
    sqlx::query(
        "INSERT INTO workspace_members (workspace_id, user_id, role) \
            SELECT $1::uuid, id, $3 FROM users WHERE email = $2",
    )
    .bind(workspace_id)
    .bind(email)
    .bind(role)
    .execute(pool)
    .await?;
    Ok(())
}

async fn remove_me(
    app: &axum::Router,
    cookie: &str,
    password: &str,
    confirmation: &str,
    delete_workspaces: bool,
) -> anyhow::Result<(StatusCode, Value)> {
    call(
        app,
        "DELETE",
        "/api/users/me",
        Some(cookie),
        Some(json!({
            "password": password,
            "confirmation": confirmation,
            "delete_owned_workspaces": delete_workspaces
        })),
    )
    .await
}

async fn count(pool: &PgPool, sql: &'static str, email: &str) -> anyhow::Result<i64> {
    Ok(sqlx::query_scalar(sql).bind(email).fetch_one(pool).await?)
}

#[tokio::test]
async fn the_export_holds_my_data_and_never_a_secret() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    let (_, card) = call(
        &app,
        "POST",
        &format!("/api/lists/{list_id}/cards"),
        Some(&alice),
        Some(json!({ "title": "Ship it" })),
    )
    .await?;
    let card_id = id_of(&card)?;
    call(
        &app,
        "POST",
        &format!("/api/cards/{card_id}/comments"),
        Some(&alice),
        Some(json!({ "body": "Looks good to me" })),
    )
    .await?;
    let (_, made) = call(
        &app,
        "POST",
        &format!("/api/boards/{board_id}/blocks"),
        Some(&alice),
        Some(json!({ "kind": "poll", "name": "Lunch", "config": {
            "question": "Where?", "options": [ { "id": "a", "text": "Pizza" }, { "id": "b", "text": "Ramen" } ] } })),
    )
    .await?;
    call(
        &app,
        "PUT",
        &format!("/api/lists/{}/poll/vote", id_of(&made)?),
        Some(&alice),
        Some(json!({ "option_id": "b" })),
    )
    .await?;

    let raw = app
        .clone()
        .oneshot(with_connect_info(
            Request::builder()
                .method("GET")
                .uri("/api/users/me/export")
                .header(header::COOKIE, &alice)
                .body(Body::empty())?,
        ))
        .await?;
    assert_eq!(raw.status(), StatusCode::OK);
    assert_eq!(raw.headers()[header::CACHE_CONTROL], "no-store");
    assert!(
        raw.headers()[header::CONTENT_DISPOSITION]
            .to_str()?
            .starts_with("attachment")
    );
    let bytes = axum::body::to_bytes(raw.into_body(), usize::MAX).await?;
    let text = String::from_utf8(bytes.to_vec())?;
    let data: Value = serde_json::from_str(&text)?;

    assert_eq!(data["profile"]["email"], "alice@example.com");
    assert_eq!(data["profile"]["username"], "alice");
    assert_eq!(data["memberships"][0]["role"], "owner");
    assert_eq!(data["comments"][0]["body"], "Looks good to me");
    assert_eq!(data["comments"][0]["card"], "Ship it");
    assert_eq!(data["poll_votes"][0]["question"], "Where?");
    assert_eq!(data["poll_votes"][0]["option"], "Ramen");
    for secret in ["password", "hash", "argon", "token", "code"] {
        assert!(
            !text.to_lowercase().contains(secret),
            "the export mentions {secret}: {text}"
        );
    }
    Ok(())
}

#[tokio::test]
async fn the_export_needs_a_session_and_is_rate_limited() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let (status, _) = call(&app, "GET", "/api/users/me/export", None, None).await?;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let mut last = StatusCode::OK;
    for _ in 0..8 {
        (last, _) = call(&app, "GET", "/api/users/me/export", Some(&alice), None).await?;
    }
    assert_eq!(last, StatusCode::TOO_MANY_REQUESTS);
    Ok(())
}

#[tokio::test]
async fn deleting_needs_the_password_and_the_username() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;

    let (status, _) = remove_me(&app, &alice, "not-the-password", "alice", false).await?;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) = remove_me(&app, &alice, "a-strong-password", "somebody", false).await?;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    assert_eq!(
        count(
            &pool,
            "SELECT count(*) FROM users WHERE email = $1",
            "alice@example.com"
        )
        .await?,
        1,
        "a refused request deletes nothing"
    );
    Ok(())
}

#[tokio::test]
async fn deleting_removes_the_account_ends_the_session_and_keeps_what_others_read()
-> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let wen = signed_in_cookie(&app, &pool, "wen@example.com", "wen").await?;
    let (workspace_id, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    join(&pool, &workspace_id, "wen@example.com", "writer").await?;
    let (_, card) = call(
        &app,
        "POST",
        &format!("/api/lists/{list_id}/cards"),
        Some(&wen),
        Some(json!({ "title": "Ship it" })),
    )
    .await?;
    let card_id = id_of(&card)?;
    call(
        &app,
        "POST",
        &format!("/api/cards/{card_id}/comments"),
        Some(&wen),
        Some(json!({ "body": "My words stay" })),
    )
    .await?;
    let (_, made) = call(
        &app,
        "POST",
        &format!("/api/boards/{board_id}/blocks"),
        Some(&alice),
        Some(json!({ "kind": "poll", "name": "Lunch", "config": {
            "question": "Where?", "options": [ { "id": "a", "text": "Pizza" }, { "id": "b", "text": "Ramen" } ] } })),
    )
    .await?;
    let poll_id = id_of(&made)?;
    call(
        &app,
        "PUT",
        &format!("/api/lists/{poll_id}/poll/vote"),
        Some(&wen),
        Some(json!({ "option_id": "a" })),
    )
    .await?;

    let raw = app
        .clone()
        .oneshot(with_connect_info(
            Request::builder()
                .method("DELETE")
                .uri("/api/users/me")
                .header(header::COOKIE, &wen)
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    json!({ "password": "a-strong-password", "confirmation": "wen" }).to_string(),
                ))?,
        ))
        .await?;
    assert_eq!(raw.status(), StatusCode::NO_CONTENT);
    assert!(
        raw.headers()[header::SET_COOKIE]
            .to_str()?
            .contains("Max-Age=0"),
        "the session cookie is cleared"
    );

    assert_eq!(
        count(
            &pool,
            "SELECT count(*) FROM users WHERE email = $1",
            "wen@example.com"
        )
        .await?,
        0
    );
    let login = app
        .clone()
        .oneshot(login_request("wen@example.com", "a-strong-password")?)
        .await?;
    assert_eq!(login.status(), StatusCode::UNAUTHORIZED);

    let view = board_view(&app, &alice, &board_id).await?;
    let tally = view["polls"]
        .as_array()
        .and_then(|polls| polls.first())
        .cloned()
        .unwrap_or(Value::Null);
    assert_eq!(tally["total"], 0, "the vote went with the account");
    let members = view["members"].as_array().map(Vec::len);
    assert_eq!(members, Some(1), "the membership went too");

    let (_, timeline) = call(
        &app,
        "GET",
        &format!("/api/cards/{card_id}/timeline"),
        Some(&alice),
        None,
    )
    .await?;
    let kept = timeline["items"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .any(|item| item["body"] == "My words stay" && item["author"].is_null())
        })
        .unwrap_or(false);
    assert!(kept, "the comment stays without an author: {timeline}");
    Ok(())
}

#[tokio::test]
async fn a_workspace_with_other_members_blocks_the_deletion_until_asked_to_go() -> anyhow::Result<()>
{
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let wen = signed_in_cookie(&app, &pool, "wen@example.com", "wen").await?;
    let (shared_id, shared_board, _) = create_workspace_board_list(&app, &alice).await?;
    join(&pool, &shared_id, "wen@example.com", "writer").await?;
    call(
        &app,
        "POST",
        "/api/workspaces",
        Some(&alice),
        Some(json!({ "name": "Just mine" })),
    )
    .await?;

    let (status, body) = remove_me(&app, &alice, "a-strong-password", "alice", false).await?;
    assert_eq!(status, StatusCode::CONFLICT, "{body}");
    assert_eq!(body["workspaces"][0]["name"], "Team");
    assert_eq!(body["workspaces"][0]["other_members"], 1);
    assert_eq!(
        body["workspaces"].as_array().map(Vec::len),
        Some(1),
        "a workspace owned alone does not block"
    );
    assert_eq!(
        count(
            &pool,
            "SELECT count(*) FROM users WHERE email = $1",
            "alice@example.com"
        )
        .await?,
        1
    );

    let (status, _) = remove_me(&app, &alice, "a-strong-password", "alice", true).await?;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (status, _) = call(
        &app,
        "GET",
        &format!("/api/boards/{shared_board}"),
        Some(&wen),
        None,
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "the shared workspace is gone"
    );
    let leftover: i64 = sqlx::query_scalar("SELECT count(*) FROM workspaces")
        .fetch_one(&pool)
        .await?;
    assert_eq!(leftover, 0, "the workspace owned alone went too");
    Ok(())
}
