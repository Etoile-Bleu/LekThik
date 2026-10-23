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

async fn add_card(
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
    assert_eq!(status, StatusCode::CREATED, "{card}");
    id_of(&card)
}

fn titles(view: &Value, list_id: &str) -> Vec<String> {
    view["lists"]
        .as_array()
        .and_then(|lists| lists.iter().find(|list| list["id"] == list_id))
        .and_then(|list| list["cards"].as_array())
        .map(|cards| {
            cards
                .iter()
                .map(|card| card["title"].as_str().unwrap_or_default().to_string())
                .collect()
        })
        .unwrap_or_default()
}

#[tokio::test]
async fn a_card_is_copied_next_to_the_original_with_everything_on_it() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    let first = add_card(&app, &alice, &list_id, "First").await?;
    add_card(&app, &alice, &list_id, "Last").await?;

    let (_, label) = call(
        &app,
        "POST",
        &format!("/api/boards/{board_id}/labels"),
        Some(&alice),
        Some(json!({ "name": "Bug", "color": "pink", "priority": "none" })),
    )
    .await?;
    let label_id = id_of(&label)?;
    call(
        &app,
        "PUT",
        &format!("/api/cards/{first}/labels"),
        Some(&alice),
        Some(json!({ "label_ids": [label_id] })),
    )
    .await?;
    call(
        &app,
        "PATCH",
        &format!("/api/cards/{first}"),
        Some(&alice),
        Some(json!({ "description": "Some **notes**", "due_date": "2026-03-14" })),
    )
    .await?;
    let (_, me) = call(&app, "GET", "/api/users/me", Some(&alice), None).await?;
    let me_id = id_of(&me)?;
    call(
        &app,
        "PUT",
        &format!("/api/cards/{first}/assignees"),
        Some(&alice),
        Some(json!({ "user_ids": [me_id] })),
    )
    .await?;

    let (status, copy) = call(
        &app,
        "POST",
        &format!("/api/cards/{first}/duplicate"),
        Some(&alice),
        None,
    )
    .await?;

    assert_eq!(status, StatusCode::CREATED, "{copy}");
    assert_eq!(copy["title"], "First (copy)");
    assert_eq!(copy["due_date"], "2026-03-14");
    assert_eq!(copy["has_description"], true);
    assert_eq!(copy["label_ids"], json!([label_id]));
    assert_eq!(copy["assignee_ids"], json!([me_id]));
    let view = board_view(&app, &alice, &board_id).await?;
    assert_eq!(titles(&view, &list_id), ["First", "First (copy)", "Last"]);

    // The copy is its own card: changing it leaves the original alone.
    let copy_id = id_of(&copy)?;
    call(
        &app,
        "PATCH",
        &format!("/api/cards/{copy_id}"),
        Some(&alice),
        Some(json!({ "due_date": null })),
    )
    .await?;
    let (_, original) = call(
        &app,
        "GET",
        &format!("/api/cards/{first}"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(original["due_date"], "2026-03-14");
    Ok(())
}

#[tokio::test]
async fn copying_a_card_is_for_writers_and_respects_the_limit() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let rita = signed_in_cookie(&app, &pool, "rita@example.com", "rita").await?;
    let eve = signed_in_cookie(&app, &pool, "eve@example.com", "eve").await?;
    let (workspace_id, _, list_id) = create_workspace_board_list(&app, &alice).await?;
    join_as(&pool, &workspace_id, "rita@example.com", "reader").await?;
    let card = add_card(&app, &alice, &list_id, "Only").await?;
    let uri = format!("/api/cards/{card}/duplicate");

    let (status, _) = call(&app, "POST", &uri, Some(&rita), None).await?;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) = call(&app, "POST", &uri, Some(&eve), None).await?;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/cards/{}/duplicate", uuid::Uuid::new_v4()),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NOT_FOUND);

    sqlx::query(
        "INSERT INTO cards (list_id, title, position) \
         SELECT $1::uuid, 'Filler ' || n, n FROM generate_series(1, 499) AS n",
    )
    .bind(&list_id)
    .execute(&pool)
    .await?;
    let (status, _) = call(&app, "POST", &uri, Some(&alice), None).await?;
    assert_eq!(status, StatusCode::CONFLICT);
    Ok(())
}

#[tokio::test]
async fn a_list_is_copied_with_its_cards_labels_and_wip_limit() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    let (_, second) = call(
        &app,
        "POST",
        &format!("/api/boards/{board_id}/lists"),
        Some(&alice),
        Some(json!({ "name": "Second" })),
    )
    .await?;
    let second_id = id_of(&second)?;
    let one = add_card(&app, &alice, &list_id, "One").await?;
    add_card(&app, &alice, &list_id, "Two").await?;
    call(
        &app,
        "PUT",
        &format!("/api/lists/{list_id}/wip-limit"),
        Some(&alice),
        Some(json!({ "limit": 4 })),
    )
    .await?;
    let (_, label) = call(
        &app,
        "POST",
        &format!("/api/boards/{board_id}/labels"),
        Some(&alice),
        Some(json!({ "name": "Bug", "color": "pink", "priority": "none" })),
    )
    .await?;
    let label_id = id_of(&label)?;
    call(
        &app,
        "PUT",
        &format!("/api/cards/{one}/labels"),
        Some(&alice),
        Some(json!({ "label_ids": [label_id] })),
    )
    .await?;

    let (status, copy) = call(
        &app,
        "POST",
        &format!("/api/lists/{list_id}/duplicate"),
        Some(&alice),
        None,
    )
    .await?;

    assert_eq!(status, StatusCode::CREATED, "{copy}");
    assert_eq!(
        copy["name"].as_str().map(|name| name.ends_with("(copy)")),
        Some(true)
    );
    let copy_id = id_of(&copy)?;
    let view = board_view(&app, &alice, &board_id).await?;
    let ids: Vec<&str> = view["lists"]
        .as_array()
        .map(|lists| {
            lists
                .iter()
                .filter_map(|list| list["id"].as_str())
                .collect()
        })
        .unwrap_or_default();
    assert_eq!(
        ids,
        [list_id.as_str(), copy_id.as_str(), second_id.as_str()]
    );
    assert_eq!(titles(&view, &copy_id), ["One", "Two"]);
    let copied = view["lists"]
        .as_array()
        .and_then(|lists| lists.iter().find(|list| list["id"] == copy_id.as_str()))
        .cloned()
        .unwrap_or(Value::Null);
    assert_eq!(copied["wip_limit"], 4);
    assert_eq!(copied["cards"][0]["label_ids"], json!([label_id]));
    assert_eq!(copied["cards"][1]["label_ids"], json!([]));
    // The original is untouched.
    assert_eq!(titles(&view, &list_id), ["One", "Two"]);
    Ok(())
}

#[tokio::test]
async fn a_block_is_copied_with_its_settings_and_a_panel_limit_applies() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let wen = signed_in_cookie(&app, &pool, "wen@example.com", "wen").await?;
    let (workspace_id, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    join_as(&pool, &workspace_id, "wen@example.com", "reader").await?;
    let (_, note) = call(
        &app,
        "POST",
        &format!("/api/boards/{board_id}/blocks"),
        Some(&alice),
        Some(json!({ "kind": "note", "name": "Notes", "config": { "text": "Remember this", "size": "wide" } })),
    )
    .await?;
    let note_id = id_of(&note)?;

    let (status, copy) = call(
        &app,
        "POST",
        &format!("/api/lists/{note_id}/duplicate"),
        Some(&alice),
        None,
    )
    .await?;

    assert_eq!(status, StatusCode::CREATED, "{copy}");
    assert_eq!(copy["kind"], "note");
    assert_eq!(copy["config"]["text"], "Remember this");
    assert_eq!(copy["config"]["size"], "wide");
    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/lists/{note_id}/duplicate"),
        Some(&wen),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::FORBIDDEN);

    sqlx::query(
        "INSERT INTO lists (board_id, name, position) \
         SELECT $1::uuid, 'Filler ' || n, 100 + n FROM generate_series(1, 48) AS n",
    )
    .bind(&board_id)
    .execute(&pool)
    .await?;
    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/lists/{note_id}/duplicate"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::CONFLICT);
    Ok(())
}
