mod common;

use axum::http::StatusCode;
use serde_json::{Value, json};

use common::{board_view, call, create_workspace_board_list, id_of, signed_in_cookie, spawn_app};

struct Owned {
    workspace_id: String,
    board_id: String,
    list_id: String,
    card_id: String,
    label_id: String,
}

async fn seed_owned_data(app: &axum::Router, cookie: &str) -> anyhow::Result<Owned> {
    let (workspace_id, board_id, list_id) = create_workspace_board_list(app, cookie).await?;

    let (_, card) = call(
        app,
        "POST",
        &format!("/api/lists/{list_id}/cards"),
        Some(cookie),
        Some(json!({ "title": "Secret card" })),
    )
    .await?;

    let view = board_view(app, cookie, &board_id).await?;
    let label_id = view["labels"][0]["id"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| anyhow::anyhow!("board has no seeded label"))?;

    Ok(Owned {
        workspace_id,
        board_id,
        list_id,
        card_id: id_of(&card)?,
        label_id,
    })
}

fn requests_against(owned: &Owned) -> Vec<(&'static str, String, Option<Value>)> {
    let Owned {
        workspace_id,
        board_id,
        list_id,
        card_id,
        label_id,
    } = owned;

    vec![
        (
            "PATCH",
            format!("/api/workspaces/{workspace_id}"),
            Some(json!({ "name": "Hijacked" })),
        ),
        ("DELETE", format!("/api/workspaces/{workspace_id}"), None),
        (
            "POST",
            format!("/api/workspaces/{workspace_id}/boards"),
            Some(json!({ "name": "Planted" })),
        ),
        ("GET", format!("/api/boards/{board_id}"), None),
        (
            "PATCH",
            format!("/api/boards/{board_id}"),
            Some(json!({ "name": "Hijacked" })),
        ),
        ("DELETE", format!("/api/boards/{board_id}"), None),
        (
            "POST",
            format!("/api/boards/{board_id}/lists"),
            Some(json!({ "name": "Planted" })),
        ),
        (
            "POST",
            format!("/api/boards/{board_id}/labels"),
            Some(json!({ "name": "Planted", "color": "red", "priority": "low" })),
        ),
        (
            "PATCH",
            format!("/api/lists/{list_id}"),
            Some(json!({ "name": "Hijacked" })),
        ),
        ("DELETE", format!("/api/lists/{list_id}"), None),
        (
            "POST",
            format!("/api/lists/{list_id}/move"),
            Some(json!({ "index": 0 })),
        ),
        (
            "POST",
            format!("/api/lists/{list_id}/cards"),
            Some(json!({ "title": "Planted" })),
        ),
        ("GET", format!("/api/cards/{card_id}"), None),
        (
            "PATCH",
            format!("/api/cards/{card_id}"),
            Some(json!({ "title": "Hijacked" })),
        ),
        ("DELETE", format!("/api/cards/{card_id}"), None),
        (
            "POST",
            format!("/api/cards/{card_id}/move"),
            Some(json!({ "list_id": list_id, "index": 0 })),
        ),
        (
            "PUT",
            format!("/api/cards/{card_id}/labels"),
            Some(json!({ "label_ids": [] })),
        ),
        (
            "PATCH",
            format!("/api/labels/{label_id}"),
            Some(json!({ "name": "Hijacked" })),
        ),
        ("DELETE", format!("/api/labels/{label_id}"), None),
    ]
}

#[tokio::test]
async fn another_user_gets_not_found_on_every_endpoint_and_changes_nothing() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let mallory = signed_in_cookie(&app, &pool, "mallory@example.com", "mallory").await?;
    let owned = seed_owned_data(&app, &alice).await?;

    for (method, uri, body) in requests_against(&owned) {
        let (status, _) = call(&app, method, &uri, Some(&mallory), body).await?;
        assert_eq!(
            status,
            StatusCode::NOT_FOUND,
            "{method} {uri} must not reveal or touch it"
        );
    }

    let view = board_view(&app, &alice, &owned.board_id).await?;
    assert_eq!(view["board"]["name"], "Roadmap");
    assert_eq!(view["lists"].as_array().map(Vec::len), Some(1));
    assert_eq!(view["lists"][0]["name"], "To do");
    assert_eq!(view["lists"][0]["cards"].as_array().map(Vec::len), Some(1));
    assert_eq!(view["lists"][0]["cards"][0]["title"], "Secret card");
    assert_eq!(view["labels"].as_array().map(Vec::len), Some(4));

    let (_, alice_workspaces) = call(&app, "GET", "/api/workspaces", Some(&alice), None).await?;
    assert_eq!(alice_workspaces[0]["name"], "Team");
    assert_eq!(
        alice_workspaces[0]["boards"].as_array().map(Vec::len),
        Some(1)
    );

    let (_, mallory_workspaces) =
        call(&app, "GET", "/api/workspaces", Some(&mallory), None).await?;
    assert_eq!(mallory_workspaces, json!([]));

    Ok(())
}

#[tokio::test]
async fn nothing_can_be_moved_or_labelled_across_owners() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let mallory = signed_in_cookie(&app, &pool, "mallory@example.com", "mallory").await?;
    let owned = seed_owned_data(&app, &alice).await?;
    let own = seed_owned_data(&app, &mallory).await?;

    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/cards/{}/move", own.card_id),
        Some(&mallory),
        Some(json!({ "list_id": owned.list_id, "index": 0 })),
    )
    .await?;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (status, _) = call(
        &app,
        "PUT",
        &format!("/api/cards/{}/labels", own.card_id),
        Some(&mallory),
        Some(json!({ "label_ids": [owned.label_id] })),
    )
    .await?;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let alice_view = board_view(&app, &alice, &owned.board_id).await?;
    assert_eq!(
        alice_view["lists"][0]["cards"].as_array().map(Vec::len),
        Some(1)
    );

    let mallory_view = board_view(&app, &mallory, &own.board_id).await?;
    assert_eq!(mallory_view["lists"][0]["cards"][0]["title"], "Secret card");
    assert_eq!(
        mallory_view["lists"][0]["cards"][0]["label_ids"]
            .as_array()
            .map(Vec::len),
        Some(0)
    );

    Ok(())
}

#[tokio::test]
async fn forged_or_missing_sessions_are_unauthorized() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let owned = seed_owned_data(&app, &alice).await?;
    let uri = format!("/api/boards/{}", owned.board_id);

    for cookie in [
        None,
        Some("session=not-a-jwt"),
        Some("session="),
        Some("other=value"),
    ] {
        let (status, _) = call(&app, "GET", &uri, cookie, None).await?;
        assert_eq!(
            status,
            StatusCode::UNAUTHORIZED,
            "cookie {cookie:?} must be refused"
        );
    }

    Ok(())
}
