mod common;

use axum::http::StatusCode;
use common::{board_view, call, create_workspace_board_list, id_of, signed_in_cookie, spawn_app};
use serde_json::json;
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

#[tokio::test]
async fn every_kind_of_block_can_be_added_and_comes_back_with_its_settings() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    let uri = format!("/api/boards/{board_id}/blocks");

    let (status, calendar) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({ "kind": "calendar", "name": "Deadlines", "config": { "size": "wide" } })),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED, "{calendar}");
    assert_eq!(calendar["kind"], "calendar");
    assert_eq!(calendar["config"], json!({ "size": "wide" }));

    let (_, agenda) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({ "kind": "agenda", "name": "This week" })),
    )
    .await?;
    assert_eq!(
        agenda["config"],
        json!({ "size": "normal", "range": "week", "mine_only": false }),
        "leaving the settings out gives the defaults"
    );

    let (_, note) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(
            json!({ "kind": "note", "name": "Rules", "config": { "text": "Be kind\nAsk early" } }),
        ),
    )
    .await?;
    assert_eq!(note["config"]["text"], "Be kind\nAsk early");

    let (status, counter) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({
            "kind": "counter", "name": "Progress",
            "config": { "metric": "done_percent", "done_list_id": list_id }
        })),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED, "{counter}");
    assert_eq!(counter["config"]["done_list_id"], list_id);

    let view = board_view(&app, &alice, &board_id).await?;
    let kinds: Vec<&str> = view["lists"]
        .as_array()
        .map(|lists| {
            lists
                .iter()
                .filter_map(|list| list["kind"].as_str())
                .collect()
        })
        .unwrap_or_default();
    assert_eq!(
        kinds,
        vec!["list", "calendar", "agenda", "note", "counter"],
        "blocks sit in the same row, in the order they were added"
    );
    assert_eq!(view["lists"][0]["config"], json!({}));
    assert_eq!(view["lists"][1]["config"], json!({ "size": "wide" }));

    Ok(())
}

#[tokio::test]
async fn blocks_follow_the_same_rules_as_lists_for_moving_renaming_and_deleting()
-> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    let (_, block) = call(
        &app,
        "POST",
        &format!("/api/boards/{board_id}/blocks"),
        Some(&alice),
        Some(json!({ "kind": "calendar", "name": "Deadlines" })),
    )
    .await?;
    let block_id = id_of(&block)?;

    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/lists/{block_id}/move"),
        Some(&alice),
        Some(json!({ "index": 0 })),
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let view = board_view(&app, &alice, &board_id).await?;
    assert_eq!(
        view["lists"][0]["kind"], "calendar",
        "a block can be moved among the lists"
    );

    let (status, renamed) = call(
        &app,
        "PATCH",
        &format!("/api/lists/{block_id}"),
        Some(&alice),
        Some(json!({ "name": "Key dates" })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(renamed["name"], "Key dates");
    assert_eq!(renamed["kind"], "calendar", "renaming keeps the kind");

    let (status, _) = call(
        &app,
        "DELETE",
        &format!("/api/lists/{block_id}"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let view = board_view(&app, &alice, &board_id).await?;
    assert_eq!(view["lists"].as_array().map(Vec::len), Some(1));

    Ok(())
}

#[tokio::test]
async fn settings_can_change_but_the_kind_never_does() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    let (_, note) = call(
        &app,
        "POST",
        &format!("/api/boards/{board_id}/blocks"),
        Some(&alice),
        Some(json!({ "kind": "note", "name": "Rules" })),
    )
    .await?;
    let uri = format!("/api/blocks/{}/config", id_of(&note)?);

    let (status, saved) = call(
        &app,
        "PUT",
        &uri,
        Some(&alice),
        Some(json!({ "kind": "note", "config": { "text": "New rules", "size": "wide" } })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK, "{saved}");
    assert_eq!(saved["config"]["text"], "New rules");

    for bad in [
        json!({ "kind": "calendar", "config": {} }),
        json!({ "kind": "list", "config": {} }),
        json!({ "kind": "note", "config": { "text": "x".repeat(10_001) } }),
        json!({ "kind": "note", "config": { "colour": "red" } }),
        json!({ "kind": "gantt", "config": {} }),
    ] {
        let (status, _) = call(&app, "PUT", &uri, Some(&alice), Some(bad.clone())).await?;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{bad}");
    }

    let (status, _) = call(
        &app,
        "PUT",
        &format!("/api/blocks/{list_id}/config"),
        Some(&alice),
        Some(json!({ "kind": "note", "config": {} })),
    )
    .await?;
    assert_eq!(status, StatusCode::BAD_REQUEST, "a list is not a block");

    let view = board_view(&app, &alice, &board_id).await?;
    assert_eq!(
        view["lists"][1]["config"]["text"], "New rules",
        "refused changes change nothing"
    );

    Ok(())
}

#[tokio::test]
async fn nonsense_is_refused_when_adding_a_block() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    let uri = format!("/api/boards/{board_id}/blocks");

    for bad in [
        json!({ "kind": "list", "name": "Doing" }),
        json!({ "kind": "gantt", "name": "Plan" }),
        json!({ "kind": "calendar", "name": "   " }),
        json!({ "kind": "calendar", "name": "Plan", "config": { "size": "huge" } }),
        json!({ "kind": "agenda", "name": "Soon", "config": { "range": "decade" } }),
        json!({ "kind": "counter", "name": "Done", "config": { "metric": "done_percent" } }),
        json!({ "kind": "counter", "name": "Days", "config": { "metric": "days_left" } }),
        json!({ "kind": "counter", "name": "Days", "config": { "metric": "days_left", "date": "2026-02-30" } }),
        json!({ "kind": "calendar" }),
        json!({ "name": "No kind" }),
        json!({ "kind": "calendar", "name": "Plan", "extra": true }),
    ] {
        let (status, _) = call(&app, "POST", &uri, Some(&alice), Some(bad.clone())).await?;
        assert!(status.is_client_error(), "{bad} gave {status}");
    }

    let view = board_view(&app, &alice, &board_id).await?;
    assert_eq!(
        view["lists"].as_array().map(Vec::len),
        Some(1),
        "nothing was added"
    );

    Ok(())
}

#[tokio::test]
async fn a_counter_can_only_measure_a_list_of_its_own_board() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (workspace_id, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    let (_, other_board) = call(
        &app,
        "POST",
        &format!("/api/workspaces/{workspace_id}/boards"),
        Some(&alice),
        Some(json!({ "name": "Elsewhere" })),
    )
    .await?;
    let (_, other_list) = call(
        &app,
        "POST",
        &format!("/api/boards/{}/lists", id_of(&other_board)?),
        Some(&alice),
        Some(json!({ "name": "Done" })),
    )
    .await?;
    let uri = format!("/api/boards/{board_id}/blocks");

    let (status, _) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({ "kind": "counter", "name": "Progress",
            "config": { "metric": "done_percent", "done_list_id": id_of(&other_list)? } })),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "a list of another board is refused"
    );

    let (_, calendar) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({ "kind": "calendar", "name": "Plan" })),
    )
    .await?;
    let (status, _) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({ "kind": "counter", "name": "Progress",
            "config": { "metric": "done_percent", "done_list_id": id_of(&calendar)? } })),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "a block is not a list of cards"
    );

    let (status, _) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({ "kind": "counter", "name": "Progress",
            "config": { "metric": "done_percent", "done_list_id": list_id } })),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED);

    Ok(())
}

#[tokio::test]
async fn a_progress_block_measures_a_done_list_of_its_own_board() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (workspace_id, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    let (_, other_board) = call(
        &app,
        "POST",
        &format!("/api/workspaces/{workspace_id}/boards"),
        Some(&alice),
        Some(json!({ "name": "Elsewhere" })),
    )
    .await?;
    let (_, other_list) = call(
        &app,
        "POST",
        &format!("/api/boards/{}/lists", id_of(&other_board)?),
        Some(&alice),
        Some(json!({ "name": "Done" })),
    )
    .await?;
    let uri = format!("/api/boards/{board_id}/blocks");

    let (status, empty) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({ "kind": "progress", "name": "Sprint" })),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED, "{empty}");
    assert_eq!(
        empty["config"],
        json!({ "size": "normal", "style": "ring", "label": "", "done_list_id": null }),
        "no list chosen yet is allowed, the screen asks for it"
    );

    let (status, progress) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({ "kind": "progress", "name": "Sprint 12",
            "config": { "style": "bar", "done_list_id": list_id } })),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED, "{progress}");
    assert_eq!(progress["config"]["style"], "bar");
    assert_eq!(progress["config"]["done_list_id"], list_id);

    let (status, _) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({ "kind": "progress", "name": "Sprint",
            "config": { "done_list_id": id_of(&other_list)? } })),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "a list of another board is refused"
    );

    let (status, _) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({ "kind": "progress", "name": "Sprint", "config": { "style": "pie" } })),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "unknown styles are refused"
    );

    Ok(())
}

#[tokio::test]
async fn cards_only_live_in_lists() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    let (_, block) = call(
        &app,
        "POST",
        &format!("/api/boards/{board_id}/blocks"),
        Some(&alice),
        Some(json!({ "kind": "note", "name": "Rules" })),
    )
    .await?;
    let block_id = id_of(&block)?;

    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/lists/{block_id}/cards"),
        Some(&alice),
        Some(json!({ "title": "Nope" })),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "no card can be added to a block"
    );

    let (_, card) = call(
        &app,
        "POST",
        &format!("/api/lists/{list_id}/cards"),
        Some(&alice),
        Some(json!({ "title": "Real card" })),
    )
    .await?;
    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/cards/{}/move", id_of(&card)?),
        Some(&alice),
        Some(json!({ "list_id": block_id, "index": 0 })),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "no card can be moved into a block"
    );

    let view = board_view(&app, &alice, &board_id).await?;
    assert_eq!(
        view["lists"][0]["cards"].as_array().map(Vec::len),
        Some(1),
        "the card stayed"
    );
    assert_eq!(view["lists"][1]["cards"].as_array().map(Vec::len), Some(0));

    Ok(())
}

#[tokio::test]
async fn only_writers_change_blocks_and_outsiders_learn_nothing() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let wen = signed_in_cookie(&app, &pool, "wen@example.com", "wen").await?;
    let rita = signed_in_cookie(&app, &pool, "rita@example.com", "rita").await?;
    let eve = signed_in_cookie(&app, &pool, "eve@example.com", "eve").await?;
    let (workspace_id, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    join_as(&pool, &workspace_id, "wen@example.com", "writer").await?;
    join_as(&pool, &workspace_id, "rita@example.com", "reader").await?;
    let uri = format!("/api/boards/{board_id}/blocks");
    let body = json!({ "kind": "note", "name": "Rules" });

    let (status, block) = call(&app, "POST", &uri, Some(&wen), Some(body.clone())).await?;
    assert_eq!(status, StatusCode::CREATED, "writers can add blocks");
    let config_uri = format!("/api/blocks/{}/config", id_of(&block)?);
    let change = json!({ "kind": "note", "config": { "text": "x" } });

    let (status, _) = call(&app, "POST", &uri, Some(&rita), Some(body.clone())).await?;
    assert_eq!(status, StatusCode::FORBIDDEN, "readers cannot add");
    let (status, _) = call(&app, "PUT", &config_uri, Some(&rita), Some(change.clone())).await?;
    assert_eq!(status, StatusCode::FORBIDDEN, "readers cannot change");
    let (status, _) = call(&app, "POST", &uri, Some(&eve), Some(body.clone())).await?;
    assert_eq!(status, StatusCode::NOT_FOUND, "outsiders learn nothing");
    let (status, _) = call(&app, "PUT", &config_uri, Some(&eve), Some(change.clone())).await?;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = call(&app, "POST", &uri, None, Some(body)).await?;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let seen = board_view(&app, &rita, &board_id).await?;
    assert_eq!(seen["lists"][1]["kind"], "note", "readers see blocks");

    Ok(())
}

#[tokio::test]
async fn blocks_count_toward_the_panel_limit() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    let uri = format!("/api/boards/{board_id}/blocks");

    for index in 1..50 {
        let (status, body) = call(
            &app,
            "POST",
            &uri,
            Some(&alice),
            Some(json!({ "kind": "calendar", "name": format!("Block {index}") })),
        )
        .await?;
        assert_eq!(status, StatusCode::CREATED, "{index}: {body}");
    }

    let (status, _) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({ "kind": "calendar", "name": "One too many" })),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::CONFLICT,
        "50 panels, lists and blocks together"
    );

    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/boards/{board_id}/lists"),
        Some(&alice),
        Some(json!({ "name": "One list too many" })),
    )
    .await?;
    assert_eq!(status, StatusCode::CONFLICT, "lists share the same limit");

    Ok(())
}
