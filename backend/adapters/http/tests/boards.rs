mod common;

use axum::http::StatusCode;
use serde_json::{Value, json};

use common::{board_view, call, create_workspace_board_list, id_of, signed_in_cookie, spawn_app};

fn names(items: &Value, key: &str) -> Vec<String> {
    items
        .as_array()
        .map(|entries| {
            entries
                .iter()
                .filter_map(|entry| entry[key].as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

#[tokio::test]
async fn a_new_board_comes_with_four_priority_labels_ordered_by_urgency() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let cookie = signed_in_cookie(&app, &pool, "owner@example.com", "owner").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &cookie).await?;

    let (status, view) = call(
        &app,
        "GET",
        &format!("/api/boards/{board_id}"),
        Some(&cookie),
        None,
    )
    .await?;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        names(&view["labels"], "name"),
        vec!["Urgent", "High", "Medium", "Low"]
    );
    assert_eq!(
        names(&view["labels"], "priority"),
        vec!["urgent", "high", "medium", "low"]
    );

    Ok(())
}

#[tokio::test]
async fn renames_and_deletes_a_board() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let cookie = signed_in_cookie(&app, &pool, "owner@example.com", "owner").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &cookie).await?;

    let (status, renamed) = call(
        &app,
        "PATCH",
        &format!("/api/boards/{board_id}"),
        Some(&cookie),
        Some(json!({ "name": "Launch plan" })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(renamed["name"], "Launch plan");

    let (status, _) = call(
        &app,
        "DELETE",
        &format!("/api/boards/{board_id}"),
        Some(&cookie),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (status, _) = call(
        &app,
        "GET",
        &format!("/api/boards/{board_id}"),
        Some(&cookie),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NOT_FOUND);

    Ok(())
}

#[tokio::test]
async fn lists_keep_their_order_and_can_be_moved_renamed_and_deleted() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let cookie = signed_in_cookie(&app, &pool, "owner@example.com", "owner").await?;
    let (_, board_id, first_list) = create_workspace_board_list(&app, &cookie).await?;

    let mut ids = vec![first_list];
    for name in ["Doing", "Done"] {
        let (status, list) = call(
            &app,
            "POST",
            &format!("/api/boards/{board_id}/lists"),
            Some(&cookie),
            Some(json!({ "name": name })),
        )
        .await?;
        assert_eq!(status, StatusCode::CREATED);
        ids.push(id_of(&list)?);
    }

    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/lists/{}/move", ids[2]),
        Some(&cookie),
        Some(json!({ "index": 0 })),
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let view = board_view(&app, &cookie, &board_id).await?;
    assert_eq!(
        names(&view["lists"], "name"),
        vec!["Done", "To do", "Doing"]
    );

    let (status, renamed) = call(
        &app,
        "PATCH",
        &format!("/api/lists/{}", ids[1]),
        Some(&cookie),
        Some(json!({ "name": "In progress" })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(renamed["name"], "In progress");

    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/lists/{}/move", ids[0]),
        Some(&cookie),
        Some(json!({ "index": 99 })),
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let view = board_view(&app, &cookie, &board_id).await?;
    assert_eq!(
        names(&view["lists"], "name"),
        vec!["Done", "In progress", "To do"]
    );

    let (status, _) = call(
        &app,
        "DELETE",
        &format!("/api/lists/{}", ids[2]),
        Some(&cookie),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let view = board_view(&app, &cookie, &board_id).await?;
    assert_eq!(names(&view["lists"], "name"), vec!["In progress", "To do"]);

    Ok(())
}

#[tokio::test]
async fn caps_the_number_of_lists_per_board() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let cookie = signed_in_cookie(&app, &pool, "owner@example.com", "owner").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &cookie).await?;

    for index in 1..50 {
        let (status, _) = call(
            &app,
            "POST",
            &format!("/api/boards/{board_id}/lists"),
            Some(&cookie),
            Some(json!({ "name": format!("List {index}") })),
        )
        .await?;
        assert_eq!(status, StatusCode::CREATED);
    }

    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/boards/{board_id}/lists"),
        Some(&cookie),
        Some(json!({ "name": "One too many" })),
    )
    .await?;
    assert_eq!(status, StatusCode::CONFLICT);

    Ok(())
}
