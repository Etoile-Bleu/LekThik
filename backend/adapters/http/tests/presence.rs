mod common;

use axum::http::StatusCode;
use common::{call, create_workspace_board_list, id_of, signed_in_cookie, spawn_app};
use serde_json::{Value, json};
use sqlx::PgPool;

async fn join_as(pool: &PgPool, workspace_id: &str, email: &str, role: &str) -> anyhow::Result<()> {
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

fn names(body: &Value) -> Vec<String> {
    body["viewers"]
        .as_array()
        .map(|viewers| {
            viewers
                .iter()
                .map(|viewer| viewer["username"].as_str().unwrap_or_default().to_string())
                .collect()
        })
        .unwrap_or_default()
}

#[tokio::test]
async fn members_see_each_other_on_a_board_and_on_a_card() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let wen = signed_in_cookie(&app, &pool, "wen@example.com", "wen").await?;
    let (workspace_id, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    join_as(&pool, &workspace_id, "wen@example.com", "reader").await?;
    let (_, card) = call(
        &app,
        "POST",
        &format!("/api/lists/{list_id}/cards"),
        Some(&alice),
        Some(json!({ "title": "A card" })),
    )
    .await?;
    let card_id = id_of(&card)?;
    let uri = format!("/api/boards/{board_id}/presence");

    let (status, _) = call(
        &app,
        "PUT",
        &uri,
        Some(&alice),
        Some(json!({ "client_id": "tab-a" })),
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);
    // A reader can be seen and can see: it is looking, not changing anything.
    let (status, _) = call(
        &app,
        "PUT",
        &uri,
        Some(&wen),
        Some(json!({ "client_id": "tab-w", "card_id": card_id })),
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (status, body) = call(&app, "GET", &uri, Some(&alice), None).await?;

    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(names(&body), ["alice", "wen"]);
    assert_eq!(body["viewers"][0]["card_id"], Value::Null);
    assert_eq!(body["viewers"][1]["card_id"], card_id);
    Ok(())
}

#[tokio::test]
async fn leaving_takes_a_person_off_the_board_at_once() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    let uri = format!("/api/boards/{board_id}/presence");
    call(
        &app,
        "PUT",
        &uri,
        Some(&alice),
        Some(json!({ "client_id": "tab-a" })),
    )
    .await?;

    let (status, _) = call(
        &app,
        "PUT",
        &uri,
        Some(&alice),
        Some(json!({ "client_id": "tab-a", "present": false })),
    )
    .await?;

    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, body) = call(&app, "GET", &uri, Some(&alice), None).await?;
    assert!(names(&body).is_empty());
    Ok(())
}

#[tokio::test]
async fn a_stranger_neither_sees_nor_is_seen_and_learns_nothing() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let eve = signed_in_cookie(&app, &pool, "eve@example.com", "eve").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    let uri = format!("/api/boards/{board_id}/presence");
    call(
        &app,
        "PUT",
        &uri,
        Some(&alice),
        Some(json!({ "client_id": "tab-a" })),
    )
    .await?;

    let (status, _) = call(&app, "GET", &uri, Some(&eve), None).await?;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = call(
        &app,
        "PUT",
        &uri,
        Some(&eve),
        Some(json!({ "client_id": "tab-e" })),
    )
    .await?;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = call(
        &app,
        "GET",
        &format!("/api/boards/{}/presence", uuid::Uuid::new_v4()),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = call(&app, "GET", &uri, None, None).await?;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let (_, body) = call(&app, "GET", &uri, Some(&alice), None).await?;
    assert_eq!(names(&body), ["alice"]);
    Ok(())
}

#[tokio::test]
async fn nonsense_is_refused() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    let (_, other_board, other_list) = create_workspace_board_list(&app, &alice).await?;
    let (_, other_card) = call(
        &app,
        "POST",
        &format!("/api/lists/{other_list}/cards"),
        Some(&alice),
        Some(json!({ "title": "Elsewhere" })),
    )
    .await?;
    let other_card_id = id_of(&other_card)?;
    let uri = format!("/api/boards/{board_id}/presence");

    for body in [
        json!({ "client_id": "" }),
        json!({ "client_id": "has space" }),
        json!({ "client_id": "a".repeat(65) }),
        json!({ "client_id": "tab-a", "card_id": other_card_id }),
        json!({ "client_id": "tab-a", "card_id": uuid::Uuid::new_v4() }),
    ] {
        let (status, response) = call(&app, "PUT", &uri, Some(&alice), Some(body.clone())).await?;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{body} gave {response}");
    }
    for body in [json!({}), json!({ "client_id": "tab-a", "extra": 1 })] {
        let (status, _) = call(&app, "PUT", &uri, Some(&alice), Some(body)).await?;
        assert!(status.is_client_error(), "{status}");
    }
    let _ = other_board;

    let (_, body) = call(&app, "GET", &uri, Some(&alice), None).await?;
    assert!(names(&body).is_empty());
    Ok(())
}

#[tokio::test]
async fn someone_who_hides_their_presence_is_never_listed() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let wen = signed_in_cookie(&app, &pool, "wen@example.com", "wen").await?;
    let (workspace_id, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    join_as(&pool, &workspace_id, "wen@example.com", "writer").await?;
    let (status, _) = call(
        &app,
        "PUT",
        "/api/users/me/preferences",
        Some(&wen),
        Some(json!({ "hide_presence": true })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    let uri = format!("/api/boards/{board_id}/presence");

    let (status, _) = call(
        &app,
        "PUT",
        &uri,
        Some(&wen),
        Some(json!({ "client_id": "tab-w" })),
    )
    .await?;
    call(
        &app,
        "PUT",
        &uri,
        Some(&alice),
        Some(json!({ "client_id": "tab-a" })),
    )
    .await?;

    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, body) = call(&app, "GET", &uri, Some(&alice), None).await?;
    assert_eq!(names(&body), ["alice"]);
    // Hiding does not stop them seeing the others.
    let (status, body) = call(&app, "GET", &uri, Some(&wen), None).await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(names(&body), ["alice"]);
    Ok(())
}

#[tokio::test]
async fn one_person_with_two_tabs_is_listed_once() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    let uri = format!("/api/boards/{board_id}/presence");

    call(
        &app,
        "PUT",
        &uri,
        Some(&alice),
        Some(json!({ "client_id": "tab-1" })),
    )
    .await?;
    call(
        &app,
        "PUT",
        &uri,
        Some(&alice),
        Some(json!({ "client_id": "tab-2" })),
    )
    .await?;
    let (_, body) = call(&app, "GET", &uri, Some(&alice), None).await?;
    assert_eq!(names(&body), ["alice"]);

    // One tab closing does not take them away while the other is open.
    call(
        &app,
        "PUT",
        &uri,
        Some(&alice),
        Some(json!({ "client_id": "tab-1", "present": false })),
    )
    .await?;
    let (_, body) = call(&app, "GET", &uri, Some(&alice), None).await?;
    assert_eq!(names(&body), ["alice"]);
    Ok(())
}
