mod common;

use axum::http::StatusCode;
use serde_json::json;

use common::{call, id_of, signed_in_cookie, spawn_app};

#[tokio::test]
async fn creates_lists_renames_and_deletes_workspaces() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let cookie = signed_in_cookie(&app, &pool, "owner@example.com", "owner").await?;

    let (status, first) = call(
        &app,
        "POST",
        "/api/workspaces",
        Some(&cookie),
        Some(json!({ "name": "  Design team  " })),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(first["name"], "Design team");

    let (status, _) = call(
        &app,
        "POST",
        "/api/workspaces",
        Some(&cookie),
        Some(json!({ "name": "Engineering" })),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED);

    let first_id = id_of(&first)?;
    let (status, renamed) = call(
        &app,
        "PATCH",
        &format!("/api/workspaces/{first_id}"),
        Some(&cookie),
        Some(json!({ "name": "Product design" })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(renamed["name"], "Product design");

    let (status, listed) = call(&app, "GET", "/api/workspaces", Some(&cookie), None).await?;
    assert_eq!(status, StatusCode::OK);
    let names: Vec<&str> = listed
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item["name"].as_str())
                .collect()
        })
        .unwrap_or_default();
    assert_eq!(names, vec!["Product design", "Engineering"]);

    let (status, _) = call(
        &app,
        "DELETE",
        &format!("/api/workspaces/{first_id}"),
        Some(&cookie),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let (_, listed) = call(&app, "GET", "/api/workspaces", Some(&cookie), None).await?;
    assert_eq!(listed.as_array().map(Vec::len), Some(1));

    Ok(())
}

#[tokio::test]
async fn lists_boards_inside_their_workspace() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let cookie = signed_in_cookie(&app, &pool, "owner@example.com", "owner").await?;

    let (_, workspace) = call(
        &app,
        "POST",
        "/api/workspaces",
        Some(&cookie),
        Some(json!({ "name": "Team" })),
    )
    .await?;
    let workspace_id = id_of(&workspace)?;

    for name in ["Roadmap", "Bugs"] {
        let (status, _) = call(
            &app,
            "POST",
            &format!("/api/workspaces/{workspace_id}/boards"),
            Some(&cookie),
            Some(json!({ "name": name })),
        )
        .await?;
        assert_eq!(status, StatusCode::CREATED);
    }

    let (_, listed) = call(&app, "GET", "/api/workspaces", Some(&cookie), None).await?;
    let boards = listed[0]["boards"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item["name"].as_str())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    assert_eq!(boards, vec!["Roadmap", "Bugs"]);

    Ok(())
}

#[tokio::test]
async fn rejects_invalid_names_and_unknown_fields() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let cookie = signed_in_cookie(&app, &pool, "owner@example.com", "owner").await?;

    let invalid_names = [
        json!(""),
        json!("   "),
        json!("a".repeat(121)),
        json!("bad\u{0}name"),
    ];
    for name in invalid_names {
        let (status, _) = call(
            &app,
            "POST",
            "/api/workspaces",
            Some(&cookie),
            Some(json!({ "name": name })),
        )
        .await?;
        assert_eq!(
            status,
            StatusCode::BAD_REQUEST,
            "name {name} should be rejected"
        );
    }

    let (status, _) = call(
        &app,
        "POST",
        "/api/workspaces",
        Some(&cookie),
        Some(json!({ "name": "Team", "owner_id": "00000000-0000-0000-0000-000000000000" })),
    )
    .await?;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);

    Ok(())
}

#[tokio::test]
async fn caps_the_number_of_workspaces_per_user() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let cookie = signed_in_cookie(&app, &pool, "owner@example.com", "owner").await?;

    for index in 0..50 {
        let (status, _) = call(
            &app,
            "POST",
            "/api/workspaces",
            Some(&cookie),
            Some(json!({ "name": format!("Workspace {index}") })),
        )
        .await?;
        assert_eq!(status, StatusCode::CREATED);
    }

    let (status, body) = call(
        &app,
        "POST",
        "/api/workspaces",
        Some(&cookie),
        Some(json!({ "name": "One too many" })),
    )
    .await?;
    assert_eq!(status, StatusCode::CONFLICT);
    assert!(
        body["message"]
            .as_str()
            .is_some_and(|m| m.contains("workspaces"))
    );

    Ok(())
}

#[tokio::test]
async fn requires_a_session() -> anyhow::Result<()> {
    let (app, _pool, _container) = spawn_app().await?;

    let (status, _) = call(&app, "GET", "/api/workspaces", None, None).await?;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let (status, _) = call(
        &app,
        "POST",
        "/api/workspaces",
        None,
        Some(json!({ "name": "Team" })),
    )
    .await?;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    Ok(())
}
