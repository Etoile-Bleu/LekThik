mod common;

use axum::http::StatusCode;
use common::{call, create_workspace_board_list, id_of, signed_in_cookie, spawn_app};
use serde_json::{Value, json};
use sqlx::PgPool;

async fn join(
    pool: &PgPool,
    workspace_id: &str,
    email: &str,
    role: &str,
) -> anyhow::Result<String> {
    let id: uuid::Uuid = sqlx::query_scalar("SELECT id FROM users WHERE email = $1")
        .bind(email)
        .fetch_one(pool)
        .await?;
    sqlx::query(
        "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1::uuid, $2, $3)",
    )
    .bind(workspace_id)
    .bind(id)
    .bind(role)
    .execute(pool)
    .await?;
    Ok(id.to_string())
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

async fn timeline(app: &axum::Router, cookie: &str, card_id: &str) -> anyhow::Result<Vec<Value>> {
    let (status, body) = call(
        app,
        "GET",
        &format!("/api/cards/{card_id}/timeline"),
        Some(cookie),
        None,
    )
    .await?;
    anyhow::ensure!(status == StatusCode::OK, "timeline: {status} {body}");
    Ok(body["items"].as_array().cloned().unwrap_or_default())
}

fn kinds(items: &[Value]) -> Vec<String> {
    items
        .iter()
        .map(|item| {
            if item["type"] == "comment" {
                "comment".to_string()
            } else {
                item["kind"].as_str().unwrap_or("?").to_string()
            }
        })
        .collect()
}

async fn comment(
    app: &axum::Router,
    cookie: &str,
    card_id: &str,
    body: &str,
) -> anyhow::Result<(StatusCode, Value)> {
    call(
        app,
        "POST",
        &format!("/api/cards/{card_id}/comments"),
        Some(cookie),
        Some(json!({ "body": body })),
    )
    .await
}

#[tokio::test]
async fn a_writer_comments_and_everyone_in_the_workspace_reads_it() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let wen = signed_in_cookie(&app, &pool, "wen@example.com", "wen").await?;
    let rita = signed_in_cookie(&app, &pool, "rita@example.com", "rita").await?;
    let (workspace_id, _, list_id) = create_workspace_board_list(&app, &alice).await?;
    join(&pool, &workspace_id, "wen@example.com", "writer").await?;
    join(&pool, &workspace_id, "rita@example.com", "reader").await?;
    let card_id = new_card(&app, &alice, &list_id).await?;

    let (status, posted) = comment(&app, &wen, &card_id, "  Looks good\r\nto me  ").await?;
    assert_eq!(status, StatusCode::CREATED, "{posted}");
    assert_eq!(posted["body"], "Looks good\nto me");
    assert_eq!(posted["author"]["username"], "wen");
    assert_eq!(posted["edited_at"], Value::Null);

    let seen = timeline(&app, &rita, &card_id).await?;
    assert_eq!(kinds(&seen), vec!["created", "comment"]);
    assert_eq!(seen[0]["to"], "To do");
    assert_eq!(seen[0]["actor"]["username"], "alice");
    assert_eq!(seen[1]["body"], "Looks good\nto me");

    let (status, _) = comment(&app, &rita, &card_id, "Can I?").await?;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "readers read, they do not comment"
    );
    Ok(())
}

#[tokio::test]
async fn strangers_learn_nothing_about_a_card_timeline() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let eve = signed_in_cookie(&app, &pool, "eve@example.com", "eve").await?;
    let (_, _, list_id) = create_workspace_board_list(&app, &alice).await?;
    let card_id = new_card(&app, &alice, &list_id).await?;
    let (_, posted) = comment(&app, &alice, &card_id, "Private").await?;
    let comment_uri = format!("/api/cards/{card_id}/comments/{}", id_of(&posted)?);

    let (status, _) = call(
        &app,
        "GET",
        &format!("/api/cards/{card_id}/timeline"),
        Some(&eve),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = comment(&app, &eve, &card_id, "Hello").await?;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = call(
        &app,
        "PATCH",
        &comment_uri,
        Some(&eve),
        Some(json!({ "body": "Mine now" })),
    )
    .await?;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = call(&app, "DELETE", &comment_uri, Some(&eve), None).await?;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = call(
        &app,
        "GET",
        &format!("/api/cards/{card_id}/timeline"),
        None,
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    Ok(())
}

#[tokio::test]
async fn only_the_author_edits_and_the_author_or_an_admin_deletes() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let wen = signed_in_cookie(&app, &pool, "wen@example.com", "wen").await?;
    let max = signed_in_cookie(&app, &pool, "max@example.com", "max").await?;
    let (workspace_id, _, list_id) = create_workspace_board_list(&app, &alice).await?;
    join(&pool, &workspace_id, "wen@example.com", "writer").await?;
    join(&pool, &workspace_id, "max@example.com", "writer").await?;
    let card_id = new_card(&app, &alice, &list_id).await?;
    let (_, first) = comment(&app, &wen, &card_id, "First").await?;
    let uri = format!("/api/cards/{card_id}/comments/{}", id_of(&first)?);

    let (status, _) = call(
        &app,
        "PATCH",
        &uri,
        Some(&max),
        Some(json!({ "body": "Hijack" })),
    )
    .await?;
    assert_eq!(status, StatusCode::FORBIDDEN, "another writer cannot edit");
    let (status, _) = call(&app, "DELETE", &uri, Some(&max), None).await?;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "another writer cannot delete"
    );

    let (status, edited) = call(
        &app,
        "PATCH",
        &uri,
        Some(&wen),
        Some(json!({ "body": "First, fixed" })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK, "{edited}");
    assert_eq!(edited["body"], "First, fixed");
    assert_ne!(
        edited["edited_at"],
        Value::Null,
        "an edited comment says so"
    );

    let (status, _) = call(&app, "DELETE", &uri, Some(&alice), None).await?;
    assert_eq!(status, StatusCode::NO_CONTENT, "the owner moderates");
    let (status, _) = call(&app, "DELETE", &uri, Some(&alice), None).await?;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (_, mine) = comment(&app, &max, &card_id, "Mine").await?;
    let (status, _) = call(
        &app,
        "DELETE",
        &format!("/api/cards/{card_id}/comments/{}", id_of(&mine)?),
        Some(&max),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT, "authors delete their own");
    assert_eq!(
        kinds(&timeline(&app, &alice, &card_id).await?),
        vec!["created"]
    );
    Ok(())
}

#[tokio::test]
async fn comments_are_checked_and_limited_by_the_server() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, _, list_id) = create_workspace_board_list(&app, &alice).await?;
    let card_id = new_card(&app, &alice, &list_id).await?;

    for bad in ["", "   \n", "bell\u{7}", &"x".repeat(5_001)] {
        let (status, _) = comment(&app, &alice, &card_id, bad).await?;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{bad:?}");
    }
    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/cards/{card_id}/comments"),
        Some(&alice),
        Some(json!({ "body": "ok", "author": "someone else" })),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "an author cannot be chosen"
    );

    let (status, kept) = comment(&app, &alice, &card_id, "<script>alert(1)</script>").await?;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(kept["body"], "<script>alert(1)</script>", "kept as text");

    for index in 0..19 {
        let (status, body) = comment(&app, &alice, &card_id, &format!("Note {index}")).await?;
        assert_eq!(status, StatusCode::CREATED, "{index}: {body}");
    }
    let (status, _) = comment(&app, &alice, &card_id, "One too many this minute").await?;
    assert_eq!(status, StatusCode::CONFLICT, "twenty a minute is the limit");
    Ok(())
}

#[tokio::test]
async fn a_card_holds_at_most_five_hundred_comments() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, _, list_id) = create_workspace_board_list(&app, &alice).await?;
    let card_id = new_card(&app, &alice, &list_id).await?;
    sqlx::query(
        "INSERT INTO card_comments (card_id, author_id, body, created_at) \
            SELECT $1::uuid, NULL, 'old', now() - interval '1 day' FROM generate_series(1, 500)",
    )
    .bind(&card_id)
    .execute(&pool)
    .await?;

    let (status, _) = comment(&app, &alice, &card_id, "The 501st").await?;

    assert_eq!(status, StatusCode::CONFLICT);
    let seen = timeline(&app, &alice, &card_id).await?;
    assert!(seen.len() <= 200, "the timeline shows the latest 200");
    Ok(())
}

#[tokio::test]
async fn what_happens_to_a_card_is_written_down_by_the_server() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let wen = signed_in_cookie(&app, &pool, "wen@example.com", "wen").await?;
    let (workspace_id, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    let wen_id = join(&pool, &workspace_id, "wen@example.com", "writer").await?;
    let (_, doing) = call(
        &app,
        "POST",
        &format!("/api/boards/{board_id}/lists"),
        Some(&alice),
        Some(json!({ "name": "Doing" })),
    )
    .await?;
    let (_, label) = call(
        &app,
        "POST",
        &format!("/api/boards/{board_id}/labels"),
        Some(&alice),
        Some(json!({ "name": "Bug", "color": "red", "priority": "high" })),
    )
    .await?;
    let card_id = new_card(&app, &alice, &list_id).await?;
    let card_uri = format!("/api/cards/{card_id}");

    call(
        &app,
        "PATCH",
        &card_uri,
        Some(&wen),
        Some(json!({ "title": "Ship it now" })),
    )
    .await?;
    call(
        &app,
        "PATCH",
        &card_uri,
        Some(&wen),
        Some(json!({ "description": "One" })),
    )
    .await?;
    call(
        &app,
        "PATCH",
        &card_uri,
        Some(&wen),
        Some(json!({ "description": "Two" })),
    )
    .await?;
    call(
        &app,
        "PATCH",
        &card_uri,
        Some(&wen),
        Some(json!({ "due_date": "2026-11-02" })),
    )
    .await?;
    call(
        &app,
        "PATCH",
        &card_uri,
        Some(&wen),
        Some(json!({ "due_date": null })),
    )
    .await?;
    call(
        &app,
        "POST",
        &format!("{card_uri}/move"),
        Some(&wen),
        Some(json!({ "list_id": id_of(&doing)?, "index": 0 })),
    )
    .await?;
    call(
        &app,
        "PUT",
        &format!("{card_uri}/labels"),
        Some(&wen),
        Some(json!({ "label_ids": [id_of(&label)?] })),
    )
    .await?;
    call(
        &app,
        "PUT",
        &format!("{card_uri}/labels"),
        Some(&wen),
        Some(json!({ "label_ids": [] })),
    )
    .await?;
    call(
        &app,
        "PUT",
        &format!("{card_uri}/assignees"),
        Some(&wen),
        Some(json!({ "user_ids": [wen_id] })),
    )
    .await?;
    call(
        &app,
        "PUT",
        &format!("{card_uri}/assignees"),
        Some(&wen),
        Some(json!({ "user_ids": [] })),
    )
    .await?;
    call(
        &app,
        "PATCH",
        &card_uri,
        Some(&wen),
        Some(json!({ "title": "Ship it now" })),
    )
    .await?;

    let seen = timeline(&app, &alice, &card_id).await?;

    assert_eq!(
        kinds(&seen),
        vec![
            "created",
            "renamed",
            "described",
            "due_set",
            "due_cleared",
            "moved",
            "label_added",
            "label_removed",
            "assigned",
            "unassigned"
        ],
        "a second description edit within ten minutes and a rename to the same title add nothing"
    );
    assert_eq!(seen[1]["from"], "Ship it");
    assert_eq!(seen[1]["to"], "Ship it now");
    assert_eq!(seen[3]["to"], "2026-11-02");
    assert_eq!(
        (seen[5]["from"].clone(), seen[5]["to"].clone()),
        (json!("To do"), json!("Doing"))
    );
    assert_eq!(seen[6]["to"], "Bug");
    assert_eq!(seen[8]["subject"]["username"], "wen");
    assert_eq!(seen[1]["actor"]["username"], "wen");
    Ok(())
}

#[tokio::test]
async fn moving_within_a_list_or_changing_nothing_writes_nothing() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, _, list_id) = create_workspace_board_list(&app, &alice).await?;
    let card_id = new_card(&app, &alice, &list_id).await?;
    let card_uri = format!("/api/cards/{card_id}");

    call(
        &app,
        "POST",
        &format!("{card_uri}/move"),
        Some(&alice),
        Some(json!({ "list_id": list_id, "index": 0 })),
    )
    .await?;
    call(&app, "PATCH", &card_uri, Some(&alice), Some(json!({}))).await?;
    call(
        &app,
        "PUT",
        &format!("{card_uri}/labels"),
        Some(&alice),
        Some(json!({ "label_ids": [] })),
    )
    .await?;

    assert_eq!(
        kinds(&timeline(&app, &alice, &card_id).await?),
        vec!["created"]
    );
    Ok(())
}

#[tokio::test]
async fn the_board_tells_how_many_comments_each_card_has() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    let busy = new_card(&app, &alice, &list_id).await?;
    new_card(&app, &alice, &list_id).await?;
    comment(&app, &alice, &busy, "One").await?;
    let (_, second) = comment(&app, &alice, &busy, "Two").await?;

    let counts = |view: &Value| -> Vec<i64> {
        view["lists"][0]["cards"]
            .as_array()
            .map(|cards| {
                cards
                    .iter()
                    .filter_map(|c| c["comment_count"].as_i64())
                    .collect()
            })
            .unwrap_or_default()
    };
    assert_eq!(
        counts(&common::board_view(&app, &alice, &board_id).await?),
        vec![2, 0]
    );

    call(
        &app,
        "DELETE",
        &format!("/api/cards/{busy}/comments/{}", id_of(&second)?),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(
        counts(&common::board_view(&app, &alice, &board_id).await?),
        vec![1, 0]
    );
    Ok(())
}

#[tokio::test]
async fn deleting_a_card_deletes_its_comments_and_history() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, _, list_id) = create_workspace_board_list(&app, &alice).await?;
    let card_id = new_card(&app, &alice, &list_id).await?;
    comment(&app, &alice, &card_id, "Soon gone").await?;

    let (status, _) = call(
        &app,
        "DELETE",
        &format!("/api/cards/{card_id}"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let left: i64 = sqlx::query_scalar(
        "SELECT (SELECT count(*) FROM card_comments) + (SELECT count(*) FROM card_activity)",
    )
    .fetch_one(&pool)
    .await?;
    assert_eq!(left, 0);
    Ok(())
}

#[tokio::test]
async fn a_comment_outlives_its_author_who_becomes_anonymous() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let wen = signed_in_cookie(&app, &pool, "wen@example.com", "wen").await?;
    let (workspace_id, _, list_id) = create_workspace_board_list(&app, &alice).await?;
    join(&pool, &workspace_id, "wen@example.com", "writer").await?;
    let card_id = new_card(&app, &alice, &list_id).await?;
    comment(&app, &wen, &card_id, "Remember this").await?;
    call(
        &app,
        "PATCH",
        &format!("/api/cards/{card_id}"),
        Some(&wen),
        Some(json!({ "title": "Renamed" })),
    )
    .await?;

    sqlx::query("DELETE FROM users WHERE email = 'wen@example.com'")
        .execute(&pool)
        .await?;

    let seen = timeline(&app, &alice, &card_id).await?;
    let said = seen
        .iter()
        .find(|item| item["type"] == "comment")
        .cloned()
        .unwrap_or_default();
    let renamed = seen
        .iter()
        .find(|item| item["kind"] == "renamed")
        .cloned()
        .unwrap_or_default();
    assert_eq!(said["body"], "Remember this");
    assert_eq!(said["author"], Value::Null);
    assert_eq!(renamed["actor"], Value::Null);
    Ok(())
}
