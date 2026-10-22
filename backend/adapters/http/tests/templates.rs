mod common;

use axum::http::StatusCode;
use serde_json::{Value, json};

use common::{board_view, call, id_of, signed_in_cookie, spawn_app};

fn strings(items: &Value, key: &str) -> Vec<String> {
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
async fn the_catalogue_is_previewable_and_needs_a_session() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;

    let (status, _) = call(&app, "GET", "/api/templates", None, None).await?;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let cookie = signed_in_cookie(&app, &pool, "owner@example.com", "owner").await?;
    let (status, catalogue) = call(&app, "GET", "/api/templates", Some(&cookie), None).await?;
    assert_eq!(status, StatusCode::OK);

    let boards = catalogue["boards"].as_array().cloned().unwrap_or_default();
    assert!(boards.len() >= 8);
    let sprint = boards
        .iter()
        .find(|template| template["id"] == "sprint-planning")
        .ok_or_else(|| anyhow::anyhow!("sprint planning is missing"))?;
    assert_eq!(sprint["category"], "Engineering");
    assert_eq!(
        strings(&sprint["lists"], "name"),
        vec![
            "Backlog",
            "Sprint backlog",
            "In progress",
            "In review",
            "Done"
        ]
    );
    assert!(sprint["lists"][0]["cards"][0]["title"].is_string());
    assert_eq!(sprint["labels"][0]["color"], "red");

    let workspaces = catalogue["workspaces"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    assert!(
        workspaces
            .iter()
            .any(|template| template["id"] == "software-team"
                && template["board_ids"].as_array().map(Vec::len) == Some(3))
    );

    Ok(())
}

#[tokio::test]
async fn a_board_can_start_from_a_template() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let cookie = signed_in_cookie(&app, &pool, "owner@example.com", "owner").await?;
    let (_, workspace) = call(
        &app,
        "POST",
        "/api/workspaces",
        Some(&cookie),
        Some(json!({ "name": "Platform" })),
    )
    .await?;
    let workspace_id = id_of(&workspace)?;

    let (status, board) = call(
        &app,
        "POST",
        &format!("/api/workspaces/{workspace_id}/boards"),
        Some(&cookie),
        Some(json!({ "name": "Sprint 12", "template_id": "sprint-planning" })),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(board["name"], "Sprint 12");

    let view = board_view(&app, &cookie, &id_of(&board)?).await?;

    assert_eq!(
        strings(&view["lists"], "name"),
        vec![
            "Backlog",
            "Sprint backlog",
            "In progress",
            "In review",
            "Done"
        ]
    );
    assert_eq!(
        strings(&view["labels"], "name"),
        vec!["Urgent", "High", "Medium", "Low", "Bug", "Feature", "Chore"]
    );

    let sprint_backlog = &view["lists"][1];
    let bug_card = sprint_backlog["cards"]
        .as_array()
        .and_then(|cards| {
            cards
                .iter()
                .find(|card| card["title"] == "Cards keep the wrong order after a move")
        })
        .ok_or_else(|| anyhow::anyhow!("the sample bug card is missing"))?;
    assert_eq!(bug_card["has_description"], true);

    let attached: Vec<String> = bug_card["label_ids"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(|label_id| {
            view["labels"]
                .as_array()?
                .iter()
                .find(|label| label["id"] == *label_id)?["name"]
                .as_str()
                .map(str::to_string)
        })
        .collect();
    assert!(attached.contains(&"Bug".to_string()));
    assert!(attached.contains(&"High".to_string()));

    Ok(())
}

#[tokio::test]
async fn a_workspace_can_start_from_a_template_with_all_its_boards() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let cookie = signed_in_cookie(&app, &pool, "owner@example.com", "owner").await?;

    let (status, workspace) = call(
        &app,
        "POST",
        "/api/workspaces",
        Some(&cookie),
        Some(json!({ "name": "Platform team", "template_id": "software-team" })),
    )
    .await?;

    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(workspace["name"], "Platform team");
    assert_eq!(
        strings(&workspace["boards"], "name"),
        vec!["Sprint planning", "Bug tracker", "Product roadmap"]
    );

    let (_, listed) = call(&app, "GET", "/api/workspaces", Some(&cookie), None).await?;
    assert_eq!(listed[0]["boards"].as_array().map(Vec::len), Some(3));

    let bug_tracker = listed[0]["boards"][1]["id"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("missing board id"))?;
    let view = board_view(&app, &cookie, bug_tracker).await?;
    assert_eq!(view["lists"].as_array().map(Vec::len), Some(5));

    Ok(())
}

#[tokio::test]
async fn blank_creation_is_still_the_default() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let cookie = signed_in_cookie(&app, &pool, "owner@example.com", "owner").await?;

    let (status, workspace) = call(
        &app,
        "POST",
        "/api/workspaces",
        Some(&cookie),
        Some(json!({ "name": "Empty" })),
    )
    .await?;

    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(workspace["boards"], json!([]));

    Ok(())
}

#[tokio::test]
async fn unknown_templates_are_refused_and_create_nothing() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let cookie = signed_in_cookie(&app, &pool, "owner@example.com", "owner").await?;

    let (status, _) = call(
        &app,
        "POST",
        "/api/workspaces",
        Some(&cookie),
        Some(json!({ "name": "Team", "template_id": "../etc/passwd" })),
    )
    .await?;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    let (_, listed) = call(&app, "GET", "/api/workspaces", Some(&cookie), None).await?;
    assert_eq!(listed, json!([]));

    let (_, workspace) = call(
        &app,
        "POST",
        "/api/workspaces",
        Some(&cookie),
        Some(json!({ "name": "Team" })),
    )
    .await?;
    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/workspaces/{}/boards", id_of(&workspace)?),
        Some(&cookie),
        Some(json!({ "name": "Board", "template_id": "software-team" })),
    )
    .await?;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    Ok(())
}

#[tokio::test]
async fn nobody_can_plant_a_template_board_in_someone_elses_workspace() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let mallory = signed_in_cookie(&app, &pool, "mallory@example.com", "mallory").await?;
    let (_, workspace) = call(
        &app,
        "POST",
        "/api/workspaces",
        Some(&alice),
        Some(json!({ "name": "Alice team" })),
    )
    .await?;

    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/workspaces/{}/boards", id_of(&workspace)?),
        Some(&mallory),
        Some(json!({ "name": "Planted", "template_id": "sprint-planning" })),
    )
    .await?;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (_, listed) = call(&app, "GET", "/api/workspaces", Some(&alice), None).await?;
    assert_eq!(listed[0]["boards"], json!([]));

    Ok(())
}
