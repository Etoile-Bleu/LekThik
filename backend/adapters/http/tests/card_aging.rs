mod common;

use axum::http::StatusCode;
use common::{call, create_workspace_board_list, id_of, signed_in_cookie, spawn_app};
use serde_json::json;
use sqlx::PgPool;

async fn join(pool: &PgPool, workspace_id: &str, email: &str, role: &str) -> anyhow::Result<()> {
    let id: uuid::Uuid = sqlx::query_scalar("SELECT id FROM users WHERE email = $1")
        .bind(email)
        .fetch_one(pool)
        .await?;
    sqlx::query("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1::uuid, $2::uuid, $3)")
        .bind(workspace_id)
        .bind(id)
        .bind(role)
        .execute(pool)
        .await?;
    Ok(())
}

async fn new_card(app: &axum::Router, cookie: &str, list_id: &str) -> anyhow::Result<String> {
    let (status, card) = call(
        app,
        "POST",
        &format!("/api/lists/{list_id}/cards"),
        Some(cookie),
        Some(json!({ "title": "Ship it" })),
    )
    .await?;
    anyhow::ensure!(status == StatusCode::CREATED, "card not created");
    id_of(&card)
}

#[tokio::test]
async fn a_new_card_carries_its_age_and_starts_unblocked() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, _, list_id) = create_workspace_board_list(&app, &alice).await?;
    let card_id = new_card(&app, &alice, &list_id).await?;

    let (status, card) = call(
        &app,
        "GET",
        &format!("/api/cards/{card_id}"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert!(card["created_at"].as_str().is_some());
    assert!(card["list_entered_at"].as_str().is_some());
    assert!(card["blocked_since"].is_null());
    assert!(card["blocked_reason"].is_null());

    Ok(())
}

#[tokio::test]
async fn moving_a_card_to_another_list_bumps_its_age_but_not_within_the_same_list()
-> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    let (_, other_list) = call(
        &app,
        "POST",
        &format!("/api/boards/{board_id}/lists"),
        Some(&alice),
        Some(json!({ "name": "Doing" })),
    )
    .await?;
    let other_list_id = id_of(&other_list)?;
    let card_id = new_card(&app, &alice, &list_id).await?;

    let (_, before) = call(
        &app,
        "GET",
        &format!("/api/cards/{card_id}"),
        Some(&alice),
        None,
    )
    .await?;
    let entered_before = before["list_entered_at"].as_str().unwrap().to_string();

    // list_entered_at is stored with one-second precision: wait past the second boundary so a
    // real move into another list is distinguishable from the no-op one just below.
    tokio::time::sleep(std::time::Duration::from_millis(1100)).await;

    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/cards/{card_id}/move"),
        Some(&alice),
        Some(json!({ "list_id": list_id, "index": 0 })),
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, same_list) = call(
        &app,
        "GET",
        &format!("/api/cards/{card_id}"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(
        same_list["list_entered_at"].as_str().unwrap(),
        entered_before,
        "moving within the same list does not reset the age"
    );

    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/cards/{card_id}/move"),
        Some(&alice),
        Some(json!({ "list_id": other_list_id, "index": 0 })),
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, moved) = call(
        &app,
        "GET",
        &format!("/api/cards/{card_id}"),
        Some(&alice),
        None,
    )
    .await?;
    assert_ne!(
        moved["list_entered_at"].as_str().unwrap(),
        entered_before,
        "moving into a different list resets the age"
    );

    Ok(())
}

#[tokio::test]
async fn a_card_is_blocked_and_unblocked_with_a_reason() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, _, list_id) = create_workspace_board_list(&app, &alice).await?;
    let card_id = new_card(&app, &alice, &list_id).await?;
    let uri = format!("/api/cards/{card_id}/blocked");

    let (status, card) = call(
        &app,
        "PUT",
        &uri,
        Some(&alice),
        Some(json!({ "blocked": true, "reason": "  Waiting on design  " })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK, "{card}");
    assert_eq!(card["blocked_reason"], "Waiting on design");
    let blocked_since = card["blocked_since"]
        .as_str()
        .expect("blocked_since")
        .to_string();

    let (status, card) = call(
        &app,
        "PUT",
        &uri,
        Some(&alice),
        Some(json!({ "blocked": true, "reason": "Still waiting" })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(card["blocked_reason"], "Still waiting");
    assert_eq!(
        card["blocked_since"].as_str(),
        Some(blocked_since.as_str()),
        "re-blocking keeps the original blocked-since time"
    );

    let (status, card) = call(
        &app,
        "PUT",
        &uri,
        Some(&alice),
        Some(json!({ "blocked": false })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert!(card["blocked_since"].is_null());
    assert!(card["blocked_reason"].is_null());

    Ok(())
}

#[tokio::test]
async fn blocking_a_card_is_validated_and_access_controlled() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let rita = signed_in_cookie(&app, &pool, "rita@example.com", "rita").await?;
    let eve = signed_in_cookie(&app, &pool, "eve@example.com", "eve").await?;
    let (workspace_id, _, list_id) = create_workspace_board_list(&app, &alice).await?;
    join(&pool, &workspace_id, "rita@example.com", "reader").await?;
    let card_id = new_card(&app, &alice, &list_id).await?;
    let uri = format!("/api/cards/{card_id}/blocked");

    let (status, _) = call(
        &app,
        "PUT",
        &uri,
        Some(&alice),
        Some(json!({ "blocked": true, "reason": "x".repeat(201) })),
    )
    .await?;
    assert_eq!(status, StatusCode::BAD_REQUEST, "a reason has a length cap");

    let (status, _) = call(
        &app,
        "PUT",
        &uri,
        Some(&rita),
        Some(json!({ "blocked": true })),
    )
    .await?;
    assert_eq!(status, StatusCode::FORBIDDEN, "readers cannot block a card");

    let (status, _) = call(
        &app,
        "PUT",
        &uri,
        Some(&eve),
        Some(json!({ "blocked": true })),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "strangers cannot even see the card"
    );

    let (status, _) = call(&app, "PUT", &uri, None, Some(json!({ "blocked": true }))).await?;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let (status, _) = call(
        &app,
        "PUT",
        &uri,
        Some(&alice),
        Some(json!({ "blocked": true, "extra": 1 })),
    )
    .await?;
    assert!(status.is_client_error(), "unknown fields are refused");

    Ok(())
}

#[tokio::test]
async fn a_board_picks_a_done_list_and_it_shows_up_on_the_board() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    let uri = format!("/api/boards/{board_id}/done-list");

    let (status, board) = call(
        &app,
        "PUT",
        &uri,
        Some(&alice),
        Some(json!({ "list_id": list_id })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK, "{board}");
    assert_eq!(board["done_list_id"], list_id);

    let (_, view) = call(
        &app,
        "GET",
        &format!("/api/boards/{board_id}"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(view["board"]["done_list_id"], list_id);

    let (status, board) = call(
        &app,
        "PUT",
        &uri,
        Some(&alice),
        Some(json!({ "list_id": null })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert!(board["done_list_id"].is_null(), "turned back off");

    Ok(())
}

#[tokio::test]
async fn the_done_list_must_be_a_real_list_on_this_board() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let rita = signed_in_cookie(&app, &pool, "rita@example.com", "rita").await?;
    let (workspace_id, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    join(&pool, &workspace_id, "rita@example.com", "reader").await?;
    let (_, other_board_id, other_list_id) = create_workspace_board_list(&app, &alice).await?;
    let (_, counter) = call(
        &app,
        "POST",
        &format!("/api/boards/{board_id}/blocks"),
        Some(&alice),
        Some(json!({ "kind": "counter", "name": "Overdue" })),
    )
    .await?;
    let counter_id = id_of(&counter)?;
    let uri = format!("/api/boards/{board_id}/done-list");

    let (status, _) = call(
        &app,
        "PUT",
        &uri,
        Some(&alice),
        Some(json!({ "list_id": other_list_id })),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "a list from another board is refused"
    );
    let _ = other_board_id;

    let (status, _) = call(
        &app,
        "PUT",
        &uri,
        Some(&alice),
        Some(json!({ "list_id": counter_id })),
    )
    .await?;
    assert_eq!(status, StatusCode::BAD_REQUEST, "a block is not a list");

    let (status, _) = call(
        &app,
        "PUT",
        &uri,
        Some(&rita),
        Some(json!({ "list_id": null })),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "readers cannot change the done list"
    );

    Ok(())
}
