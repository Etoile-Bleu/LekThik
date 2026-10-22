mod common;

use axum::http::StatusCode;
use serde_json::{Value, json};

use common::{board_view, call, create_workspace_board_list, id_of, signed_in_cookie, spawn_app};

fn label_named(view: &Value, name: &str) -> Option<Value> {
    view["labels"]
        .as_array()
        .and_then(|labels| labels.iter().find(|label| label["name"] == name).cloned())
}

#[tokio::test]
async fn creates_updates_and_deletes_labels_with_a_color_and_a_priority() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let cookie = signed_in_cookie(&app, &pool, "owner@example.com", "owner").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &cookie).await?;

    let (status, label) = call(
        &app,
        "POST",
        &format!("/api/boards/{board_id}/labels"),
        Some(&cookie),
        Some(json!({ "name": " Blocker ", "color": "violet", "priority": "urgent" })),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(label["name"], "Blocker");
    assert_eq!(label["color"], "violet");
    assert_eq!(label["priority"], "urgent");
    let label_id = id_of(&label)?;

    let (status, updated) = call(
        &app,
        "PATCH",
        &format!("/api/labels/{label_id}"),
        Some(&cookie),
        Some(json!({ "priority": "low" })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(updated["priority"], "low");
    assert_eq!(updated["color"], "violet");
    assert_eq!(updated["name"], "Blocker");

    let (status, _) = call(
        &app,
        "DELETE",
        &format!("/api/labels/{label_id}"),
        Some(&cookie),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let view = board_view(&app, &cookie, &board_id).await?;
    assert!(label_named(&view, "Blocker").is_none());

    Ok(())
}

#[tokio::test]
async fn rejects_colors_and_priorities_outside_the_allowed_sets() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let cookie = signed_in_cookie(&app, &pool, "owner@example.com", "owner").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &cookie).await?;
    let uri = format!("/api/boards/{board_id}/labels");

    let bad_payloads = [
        json!({ "name": "Bug", "color": "#ff0000", "priority": "high" }),
        json!({ "name": "Bug", "color": "red", "priority": "critical" }),
        json!({ "name": "Bug", "color": "red;background:url(x)", "priority": "low" }),
        json!({ "name": "", "color": "red", "priority": "low" }),
        json!({ "name": "a".repeat(41), "color": "red", "priority": "low" }),
    ];

    for payload in bad_payloads {
        let (status, _) = call(&app, "POST", &uri, Some(&cookie), Some(payload.clone())).await?;
        assert_eq!(
            status,
            StatusCode::BAD_REQUEST,
            "{payload} should be rejected"
        );
    }

    Ok(())
}

#[tokio::test]
async fn labels_attach_to_cards_and_disappear_when_deleted() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let cookie = signed_in_cookie(&app, &pool, "owner@example.com", "owner").await?;
    let (_, board_id, list_id) = create_workspace_board_list(&app, &cookie).await?;

    let view = board_view(&app, &cookie, &board_id).await?;
    let urgent = id_of(&label_named(&view, "Urgent").unwrap_or_default())?;
    let low = id_of(&label_named(&view, "Low").unwrap_or_default())?;

    let (_, card) = call(
        &app,
        "POST",
        &format!("/api/lists/{list_id}/cards"),
        Some(&cookie),
        Some(json!({ "title": "Fix the build" })),
    )
    .await?;
    let card_id = id_of(&card)?;

    let (status, set) = call(
        &app,
        "PUT",
        &format!("/api/cards/{card_id}/labels"),
        Some(&cookie),
        Some(json!({ "label_ids": [urgent, low, urgent] })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(set["label_ids"].as_array().map(Vec::len), Some(2));

    let view = board_view(&app, &cookie, &board_id).await?;
    assert_eq!(
        view["lists"][0]["cards"][0]["label_ids"]
            .as_array()
            .map(Vec::len),
        Some(2)
    );

    let (status, _) = call(
        &app,
        "DELETE",
        &format!("/api/labels/{urgent}"),
        Some(&cookie),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, card) = call(
        &app,
        "GET",
        &format!("/api/cards/{card_id}"),
        Some(&cookie),
        None,
    )
    .await?;
    assert_eq!(card["label_ids"], json!([low]));

    let (status, _) = call(
        &app,
        "PUT",
        &format!("/api/cards/{card_id}/labels"),
        Some(&cookie),
        Some(json!({ "label_ids": [] })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    let (_, card) = call(
        &app,
        "GET",
        &format!("/api/cards/{card_id}"),
        Some(&cookie),
        None,
    )
    .await?;
    assert_eq!(card["label_ids"], json!([]));

    Ok(())
}

#[tokio::test]
async fn a_card_only_accepts_labels_of_its_own_board() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let cookie = signed_in_cookie(&app, &pool, "owner@example.com", "owner").await?;
    let (workspace_id, _, list_id) = create_workspace_board_list(&app, &cookie).await?;

    let (_, other_board) = call(
        &app,
        "POST",
        &format!("/api/workspaces/{workspace_id}/boards"),
        Some(&cookie),
        Some(json!({ "name": "Another board" })),
    )
    .await?;
    let other_view = board_view(&app, &cookie, &id_of(&other_board)?).await?;
    let foreign_label = id_of(&label_named(&other_view, "High").unwrap_or_default())?;

    let (_, card) = call(
        &app,
        "POST",
        &format!("/api/lists/{list_id}/cards"),
        Some(&cookie),
        Some(json!({ "title": "Card" })),
    )
    .await?;

    let (status, _) = call(
        &app,
        "PUT",
        &format!("/api/cards/{}/labels", id_of(&card)?),
        Some(&cookie),
        Some(json!({ "label_ids": [foreign_label] })),
    )
    .await?;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    Ok(())
}

#[tokio::test]
async fn caps_the_number_of_labels_per_board() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let cookie = signed_in_cookie(&app, &pool, "owner@example.com", "owner").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &cookie).await?;
    let uri = format!("/api/boards/{board_id}/labels");

    for index in 0..26 {
        let (status, _) = call(
            &app,
            "POST",
            &uri,
            Some(&cookie),
            Some(json!({ "name": format!("Label {index}"), "color": "teal", "priority": "none" })),
        )
        .await?;
        assert_eq!(status, StatusCode::CREATED);
    }

    let (status, _) = call(
        &app,
        "POST",
        &uri,
        Some(&cookie),
        Some(json!({ "name": "One too many", "color": "teal", "priority": "none" })),
    )
    .await?;
    assert_eq!(status, StatusCode::CONFLICT);

    Ok(())
}
