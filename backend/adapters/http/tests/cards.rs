mod common;

use axum::http::StatusCode;
use serde_json::{Value, json};

use common::{board_view, call, create_workspace_board_list, id_of, signed_in_cookie, spawn_app};

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
    anyhow::ensure!(
        status == StatusCode::CREATED,
        "card creation failed: {card}"
    );
    id_of(&card)
}

fn card_titles(view: &Value, list_index: usize) -> Vec<String> {
    view["lists"][list_index]["cards"]
        .as_array()
        .map(|cards| {
            cards
                .iter()
                .filter_map(|card| card["title"].as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

#[tokio::test]
async fn creates_reads_updates_and_deletes_a_card() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let cookie = signed_in_cookie(&app, &pool, "owner@example.com", "owner").await?;
    let (_, board_id, list_id) = create_workspace_board_list(&app, &cookie).await?;

    let card_id = add_card(&app, &cookie, &list_id, "  Write the spec  ").await?;

    let (status, card) = call(
        &app,
        "GET",
        &format!("/api/cards/{card_id}"),
        Some(&cookie),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(card["title"], "Write the spec");
    assert_eq!(card["description"], "");

    let view = board_view(&app, &cookie, &board_id).await?;
    assert_eq!(view["lists"][0]["cards"][0]["has_description"], false);

    let (status, updated) = call(
        &app,
        "PATCH",
        &format!("/api/cards/{card_id}"),
        Some(&cookie),
        Some(json!({ "description": "Cover the happy path\nand the failures" })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(updated["title"], "Write the spec");
    assert_eq!(
        updated["description"],
        "Cover the happy path\nand the failures"
    );

    let view = board_view(&app, &cookie, &board_id).await?;
    assert_eq!(view["lists"][0]["cards"][0]["has_description"], true);

    let (status, retitled) = call(
        &app,
        "PATCH",
        &format!("/api/cards/{card_id}"),
        Some(&cookie),
        Some(json!({ "title": "Write the design" })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        retitled["description"],
        "Cover the happy path\nand the failures"
    );

    let (status, _) = call(
        &app,
        "DELETE",
        &format!("/api/cards/{card_id}"),
        Some(&cookie),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _) = call(
        &app,
        "GET",
        &format!("/api/cards/{card_id}"),
        Some(&cookie),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NOT_FOUND);

    Ok(())
}

#[tokio::test]
async fn rejects_invalid_card_input() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let cookie = signed_in_cookie(&app, &pool, "owner@example.com", "owner").await?;
    let (_, _, list_id) = create_workspace_board_list(&app, &cookie).await?;
    let card_id = add_card(&app, &cookie, &list_id, "Valid").await?;

    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/lists/{list_id}/cards"),
        Some(&cookie),
        Some(json!({ "title": "  " })),
    )
    .await?;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let (status, _) = call(
        &app,
        "PATCH",
        &format!("/api/cards/{card_id}"),
        Some(&cookie),
        Some(json!({ "description": "x".repeat(10_001) })),
    )
    .await?;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let (status, _) = call(
        &app,
        "PATCH",
        &format!("/api/cards/{card_id}"),
        Some(&cookie),
        Some(json!({ "list_id": "00000000-0000-0000-0000-000000000000" })),
    )
    .await?;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);

    Ok(())
}

#[tokio::test]
async fn moves_cards_within_and_across_lists() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let cookie = signed_in_cookie(&app, &pool, "owner@example.com", "owner").await?;
    let (_, board_id, todo) = create_workspace_board_list(&app, &cookie).await?;

    let (_, done) = call(
        &app,
        "POST",
        &format!("/api/boards/{board_id}/lists"),
        Some(&cookie),
        Some(json!({ "name": "Done" })),
    )
    .await?;
    let done = id_of(&done)?;

    let a = add_card(&app, &cookie, &todo, "A").await?;
    let _b = add_card(&app, &cookie, &todo, "B").await?;
    let c = add_card(&app, &cookie, &todo, "C").await?;
    let _d = add_card(&app, &cookie, &done, "D").await?;

    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/cards/{c}/move"),
        Some(&cookie),
        Some(json!({ "list_id": todo, "index": 0 })),
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let view = board_view(&app, &cookie, &board_id).await?;
    assert_eq!(card_titles(&view, 0), vec!["C", "A", "B"]);

    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/cards/{a}/move"),
        Some(&cookie),
        Some(json!({ "list_id": done, "index": 1 })),
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let view = board_view(&app, &cookie, &board_id).await?;
    assert_eq!(card_titles(&view, 0), vec!["C", "B"]);
    assert_eq!(card_titles(&view, 1), vec!["D", "A"]);

    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/cards/{c}/move"),
        Some(&cookie),
        Some(json!({ "list_id": done, "index": 500 })),
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let view = board_view(&app, &cookie, &board_id).await?;
    assert_eq!(card_titles(&view, 0), vec!["B"]);
    assert_eq!(card_titles(&view, 1), vec!["D", "A", "C"]);

    Ok(())
}

#[tokio::test]
async fn a_card_cannot_move_to_a_list_of_another_board() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let cookie = signed_in_cookie(&app, &pool, "owner@example.com", "owner").await?;
    let (workspace_id, _, list_id) = create_workspace_board_list(&app, &cookie).await?;
    let card_id = add_card(&app, &cookie, &list_id, "Stay put").await?;

    let (_, other_board) = call(
        &app,
        "POST",
        &format!("/api/workspaces/{workspace_id}/boards"),
        Some(&cookie),
        Some(json!({ "name": "Another board" })),
    )
    .await?;
    let other_board = id_of(&other_board)?;
    let (_, foreign_list) = call(
        &app,
        "POST",
        &format!("/api/boards/{other_board}/lists"),
        Some(&cookie),
        Some(json!({ "name": "Elsewhere" })),
    )
    .await?;
    let foreign_list = id_of(&foreign_list)?;

    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/cards/{card_id}/move"),
        Some(&cookie),
        Some(json!({ "list_id": foreign_list, "index": 0 })),
    )
    .await?;
    assert_eq!(status, StatusCode::NOT_FOUND);

    Ok(())
}
