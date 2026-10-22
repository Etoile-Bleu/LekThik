mod common;

use axum::http::StatusCode;
use common::{call, create_workspace_board_list, id_of, signed_in_cookie, spawn_app};
use serde_json::json;
use sqlx::PgPool;

async fn user_id(pool: &PgPool, email: &str) -> anyhow::Result<String> {
    let id: uuid::Uuid = sqlx::query_scalar("SELECT id FROM users WHERE email = $1")
        .bind(email)
        .fetch_one(pool)
        .await?;
    Ok(id.to_string())
}

async fn join(
    pool: &PgPool,
    workspace_id: &str,
    email: &str,
    role: &str,
) -> anyhow::Result<String> {
    let id = user_id(pool, email).await?;
    sqlx::query("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1::uuid, $2::uuid, $3)")
        .bind(workspace_id)
        .bind(&id)
        .bind(role)
        .execute(pool)
        .await?;
    Ok(id)
}

fn sorted(value: &serde_json::Value) -> Vec<String> {
    let mut ids: Vec<String> = value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    ids.sort();
    ids
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
async fn members_are_assigned_and_shown_on_the_board() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    signed_in_cookie(&app, &pool, "bob@example.com", "bob").await?;
    let (workspace_id, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    let bob_id = join(&pool, &workspace_id, "bob@example.com", "writer").await?;
    let alice_id = user_id(&pool, "alice@example.com").await?;
    let card_id = new_card(&app, &alice, &list_id).await?;

    let (status, saved) = call(
        &app,
        "PUT",
        &format!("/api/cards/{card_id}/assignees"),
        Some(&alice),
        Some(json!({ "user_ids": [bob_id, alice_id, bob_id] })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK, "{saved}");
    assert_eq!(
        saved["assignee_ids"],
        json!([bob_id, alice_id]),
        "deduplicated, in order"
    );

    let (_, view) = call(
        &app,
        "GET",
        &format!("/api/boards/{board_id}"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(sorted(&view["lists"][0]["cards"][0]["assignee_ids"]), {
        let mut both = vec![bob_id.clone(), alice_id.clone()];
        both.sort();
        both
    });
    let names: Vec<&str> = view["members"]
        .as_array()
        .map(|members| {
            members
                .iter()
                .filter_map(|member| member["username"].as_str())
                .collect()
        })
        .unwrap_or_default();
    assert_eq!(names, vec!["alice", "bob"]);
    assert!(
        view["members"][0].get("email").is_none(),
        "emails stay out of the board view"
    );

    let (_, card) = call(
        &app,
        "GET",
        &format!("/api/cards/{card_id}"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(sorted(&card["assignee_ids"]).len(), 2);

    let (status, saved) = call(
        &app,
        "PUT",
        &format!("/api/cards/{card_id}/assignees"),
        Some(&alice),
        Some(json!({ "user_ids": [alice_id] })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        saved["assignee_ids"],
        json!([alice_id]),
        "unassigning works"
    );

    let (_, saved) = call(
        &app,
        "PUT",
        &format!("/api/cards/{card_id}/assignees"),
        Some(&alice),
        Some(json!({ "user_ids": [] })),
    )
    .await?;
    assert_eq!(saved["assignee_ids"], json!([]));

    Ok(())
}

#[tokio::test]
async fn only_members_can_be_assigned_and_only_writers_can_assign() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let rita = signed_in_cookie(&app, &pool, "rita@example.com", "rita").await?;
    let eve = signed_in_cookie(&app, &pool, "eve@example.com", "eve").await?;
    let (workspace_id, _, list_id) = create_workspace_board_list(&app, &alice).await?;
    join(&pool, &workspace_id, "rita@example.com", "reader").await?;
    let eve_id = user_id(&pool, "eve@example.com").await?;
    let card_id = new_card(&app, &alice, &list_id).await?;
    let uri = format!("/api/cards/{card_id}/assignees");

    let (status, _) = call(
        &app,
        "PUT",
        &uri,
        Some(&alice),
        Some(json!({ "user_ids": [eve_id] })),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "an outsider cannot be assigned"
    );

    let (status, _) = call(
        &app,
        "PUT",
        &uri,
        Some(&alice),
        Some(json!({ "user_ids": [uuid::Uuid::new_v4()] })),
    )
    .await?;
    assert_eq!(status, StatusCode::BAD_REQUEST, "nor can an unknown id");

    let (status, _) = call(
        &app,
        "PUT",
        &uri,
        Some(&rita),
        Some(json!({ "user_ids": [] })),
    )
    .await?;
    assert_eq!(status, StatusCode::FORBIDDEN, "readers cannot assign");

    let (status, _) = call(
        &app,
        "PUT",
        &uri,
        Some(&eve),
        Some(json!({ "user_ids": [] })),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "strangers cannot even see the card"
    );

    let (status, _) = call(&app, "PUT", &uri, None, Some(json!({ "user_ids": [] }))).await?;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let too_many: Vec<String> = (0..11).map(|_| uuid::Uuid::new_v4().to_string()).collect();
    let (status, _) = call(
        &app,
        "PUT",
        &uri,
        Some(&alice),
        Some(json!({ "user_ids": too_many })),
    )
    .await?;
    assert_eq!(status, StatusCode::CONFLICT, "assignees are capped");

    let (status, _) = call(
        &app,
        "PUT",
        &uri,
        Some(&alice),
        Some(json!({ "user_ids": [], "extra": 1 })),
    )
    .await?;
    assert!(status.is_client_error(), "unknown fields are refused");

    Ok(())
}

#[tokio::test]
async fn leaving_the_workspace_clears_the_assignments() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    signed_in_cookie(&app, &pool, "bob@example.com", "bob").await?;
    let (workspace_id, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    let bob_id = join(&pool, &workspace_id, "bob@example.com", "writer").await?;
    let alice_id = user_id(&pool, "alice@example.com").await?;
    let card_id = new_card(&app, &alice, &list_id).await?;
    call(
        &app,
        "PUT",
        &format!("/api/cards/{card_id}/assignees"),
        Some(&alice),
        Some(json!({ "user_ids": [alice_id, bob_id] })),
    )
    .await?;

    let (status, _) = call(
        &app,
        "DELETE",
        &format!("/api/workspaces/{workspace_id}/members/{bob_id}"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (_, view) = call(
        &app,
        "GET",
        &format!("/api/boards/{board_id}"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(
        view["lists"][0]["cards"][0]["assignee_ids"],
        json!([alice_id])
    );
    assert_eq!(view["members"].as_array().map(Vec::len), Some(1));

    Ok(())
}

#[tokio::test]
async fn due_dates_are_set_cleared_and_validated() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let rita = signed_in_cookie(&app, &pool, "rita@example.com", "rita").await?;
    let (workspace_id, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    join(&pool, &workspace_id, "rita@example.com", "reader").await?;
    let card_id = new_card(&app, &alice, &list_id).await?;
    let uri = format!("/api/cards/{card_id}");

    let (status, card) = call(
        &app,
        "PATCH",
        &uri,
        Some(&alice),
        Some(json!({ "due_date": "2026-10-31" })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK, "{card}");
    assert_eq!(card["due_date"], "2026-10-31");

    let (_, card) = call(
        &app,
        "PATCH",
        &uri,
        Some(&alice),
        Some(json!({ "title": "Renamed" })),
    )
    .await?;
    assert_eq!(card["due_date"], "2026-10-31", "other edits keep the date");

    let (_, view) = call(
        &app,
        "GET",
        &format!("/api/boards/{board_id}"),
        Some(&rita),
        None,
    )
    .await?;
    assert_eq!(
        view["lists"][0]["cards"][0]["due_date"], "2026-10-31",
        "readers see dates"
    );

    let (status, _) = call(
        &app,
        "PATCH",
        &uri,
        Some(&rita),
        Some(json!({ "due_date": "2027-01-01" })),
    )
    .await?;
    assert_eq!(status, StatusCode::FORBIDDEN, "readers cannot change dates");

    for bad in ["2026-02-30", "tomorrow", "2026-1-5", "1999-01-01", ""] {
        let (status, _) = call(
            &app,
            "PATCH",
            &uri,
            Some(&alice),
            Some(json!({ "due_date": bad })),
        )
        .await?;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{bad}");
    }

    let (status, card) = call(
        &app,
        "PATCH",
        &uri,
        Some(&alice),
        Some(json!({ "due_date": null })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert!(card["due_date"].is_null(), "null clears the date");

    Ok(())
}
