mod common;

use axum::http::StatusCode;
use common::{board_view, call, create_workspace_board_list, id_of, signed_in_cookie, spawn_app};
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

fn tile(id: &str, x: u32, y: u32, w: u32, h: u32) -> Value {
    json!({ "id": id, "x": x, "y": y, "w": w, "h": h })
}

fn layout_of(view: &Value, id: &str) -> Value {
    view["lists"]
        .as_array()
        .and_then(|lists| lists.iter().find(|list| list["id"] == id))
        .map(|list| list["layout"].clone())
        .unwrap_or(Value::Null)
}

#[tokio::test]
async fn a_layout_is_stored_shared_and_limited_to_writers() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let wen = signed_in_cookie(&app, &pool, "wen@example.com", "wen").await?;
    let rita = signed_in_cookie(&app, &pool, "rita@example.com", "rita").await?;
    let eve = signed_in_cookie(&app, &pool, "eve@example.com", "eve").await?;
    let (workspace_id, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    join_as(&pool, &workspace_id, "wen@example.com", "writer").await?;
    join_as(&pool, &workspace_id, "rita@example.com", "reader").await?;
    let (_, note) = call(
        &app,
        "POST",
        &format!("/api/boards/{board_id}/blocks"),
        Some(&alice),
        Some(json!({ "kind": "note", "name": "Notes" })),
    )
    .await?;
    let note_id = id_of(&note)?;
    let uri = format!("/api/boards/{board_id}/layout");

    // Nobody placed anything yet.
    let view = board_view(&app, &alice, &board_id).await?;
    assert_eq!(layout_of(&view, &list_id), Value::Null);

    let (status, body) = call(
        &app,
        "PUT",
        &uri,
        Some(&alice),
        Some(json!({ "items": [tile(&list_id, 0, 0, 4, 10), tile(&note_id, 4, 2, 6, 5)] })),
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT, "{body}");

    // Another member sees the same layout.
    let view = board_view(&app, &wen, &board_id).await?;
    assert_eq!(
        layout_of(&view, &list_id),
        json!({ "x": 0, "y": 0, "w": 4, "h": 10 })
    );
    assert_eq!(
        layout_of(&view, &note_id),
        json!({ "x": 4, "y": 2, "w": 6, "h": 5 })
    );

    // A writer can move a tile, and a panel left out keeps its place.
    let (status, _) = call(
        &app,
        "PUT",
        &uri,
        Some(&wen),
        Some(json!({ "items": [tile(&note_id, 0, 10, 12, 4)] })),
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let view = board_view(&app, &alice, &board_id).await?;
    assert_eq!(
        layout_of(&view, &note_id),
        json!({ "x": 0, "y": 10, "w": 12, "h": 4 })
    );
    assert_eq!(
        layout_of(&view, &list_id),
        json!({ "x": 0, "y": 0, "w": 4, "h": 10 })
    );

    // Readers may look, never place. Strangers do not even learn the board exists.
    let (status, _) = call(
        &app,
        "PUT",
        &uri,
        Some(&rita),
        Some(json!({ "items": [tile(&note_id, 0, 0, 3, 3)] })),
    )
    .await?;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) = call(
        &app,
        "PUT",
        &uri,
        Some(&eve),
        Some(json!({ "items": [tile(&note_id, 0, 0, 3, 3)] })),
    )
    .await?;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let view = board_view(&app, &alice, &board_id).await?;
    assert_eq!(
        layout_of(&view, &note_id),
        json!({ "x": 0, "y": 10, "w": 12, "h": 4 })
    );
    Ok(())
}

#[tokio::test]
async fn a_layout_that_does_not_fit_the_grid_changes_nothing() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    let uri = format!("/api/boards/{board_id}/layout");

    for items in [
        json!([]),
        json!([tile(&list_id, 0, 0, 0, 3)]),
        json!([tile(&list_id, 0, 0, 13, 3)]),
        json!([tile(&list_id, 10, 0, 3, 3)]),
        json!([tile(&list_id, 0, 0, 3, 101)]),
        json!([tile(&list_id, 0, 399, 3, 2)]),
        json!([tile(&list_id, 0, 0, 3, 3), tile(&list_id, 3, 0, 3, 3)]),
        json!([tile(&uuid::Uuid::new_v4().to_string(), 0, 0, 3, 3)]),
    ] {
        let (status, body) = call(
            &app,
            "PUT",
            &uri,
            Some(&alice),
            Some(json!({ "items": items })),
        )
        .await?;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{items} gave {body}");
    }

    // Unknown fields are refused rather than ignored, and a negative size is not a number here.
    for body in [
        json!({ "items": [{ "id": list_id, "x": 0, "y": 0, "w": 3, "h": 3, "z": 1 }] }),
        json!({ "items": [{ "id": list_id, "x": -1, "y": 0, "w": 3, "h": 3 }] }),
        json!({ "tiles": [] }),
    ] {
        let (status, _) = call(&app, "PUT", &uri, Some(&alice), Some(body)).await?;
        assert!(status.is_client_error(), "{status}");
    }

    let view = board_view(&app, &alice, &board_id).await?;
    assert_eq!(layout_of(&view, &list_id), Value::Null);
    Ok(())
}

#[tokio::test]
async fn a_panel_of_another_board_cannot_be_placed_here() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    let (_, other_board, other_list) = create_workspace_board_list(&app, &alice).await?;

    let (status, _) = call(
        &app,
        "PUT",
        &format!("/api/boards/{board_id}/layout"),
        Some(&alice),
        Some(json!({ "items": [tile(&list_id, 0, 0, 3, 3), tile(&other_list, 3, 0, 3, 3)] })),
    )
    .await?;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // The whole call failed together: the valid tile was not kept either.
    let view = board_view(&app, &alice, &board_id).await?;
    assert_eq!(layout_of(&view, &list_id), Value::Null);
    let view = board_view(&app, &alice, &other_board).await?;
    assert_eq!(layout_of(&view, &other_list), Value::Null);
    Ok(())
}
