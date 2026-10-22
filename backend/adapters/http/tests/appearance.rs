mod common;

use axum::http::StatusCode;
use common::{call, create_workspace_board_list, id_of, signed_in_cookie, spawn_app};
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
async fn preferences_default_then_persist_per_person() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let bob = signed_in_cookie(&app, &pool, "bob@example.com", "bob").await?;

    let (status, defaults) =
        call(&app, "GET", "/api/users/me/preferences", Some(&alice), None).await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(defaults["theme"], "system");
    assert_eq!(defaults["density"], "comfortable");
    assert_eq!(defaults["card_display"]["labels"], true);
    assert_eq!(defaults["card_display"]["description_preview"], false);
    assert_eq!(defaults["color_vision"], "standard");
    assert_eq!(defaults["reading_font"], "standard");
    assert_eq!(defaults["letter_spacing"], "normal");
    assert_eq!(defaults["large_targets"], false);

    let board_id = uuid::Uuid::new_v4().to_string();
    let wanted = json!({
        "theme": "dark",
        "density": "compact",
        "text_size": "large",
        "motion": "reduce",
        "color_vision": "redgreen",
        "label_shapes": true,
        "reading_font": "hyperlegible",
        "letter_spacing": "wide",
        "strong_focus": true,
        "large_targets": true,
        "flat_backgrounds": true,
        "announce_changes": true,
        "card_display": {
            "labels": true, "due_date": true, "assignees": false,
            "description_marker": true, "description_preview": true
        },
        "card_dialog": { "order": ["assignees", "due_date", "labels", "list"], "hidden": [] },
        "boards": { board_id.clone(): {
            "card_display": {
                "labels": false, "due_date": true, "assignees": true,
                "description_marker": false, "description_preview": false
            },
            "view": "board",
            "column_width": "default",
            "collapsed_lists": []
        } }
    });
    let (status, saved) = call(
        &app,
        "PUT",
        "/api/users/me/preferences",
        Some(&alice),
        Some(wanted.clone()),
    )
    .await?;
    assert_eq!(status, StatusCode::OK, "{saved}");
    assert_eq!(saved, wanted);

    let (_, again) = call(&app, "GET", "/api/users/me/preferences", Some(&alice), None).await?;
    assert_eq!(again, wanted, "settings survive a reload");

    let (_, others) = call(&app, "GET", "/api/users/me/preferences", Some(&bob), None).await?;
    assert_eq!(others["theme"], "system", "settings belong to one person");

    let (status, replaced) = call(
        &app,
        "PUT",
        "/api/users/me/preferences",
        Some(&alice),
        Some(json!({ "theme": "light" })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        replaced["density"], "comfortable",
        "a save replaces the whole object"
    );

    Ok(())
}

#[tokio::test]
async fn preferences_refuse_garbage_and_need_a_session() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;

    for bad in [
        json!({ "theme": "neon" }),
        json!({ "density": "huge" }),
        json!({ "color_vision": "rainbow" }),
        json!({ "reading_font": "comic-sans" }),
        json!({ "letter_spacing": "extreme" }),
        json!({ "strong_focus": "yes" }),
        json!({ "colour": "red" }),
        json!({ "card_display": { "labels": "yes" } }),
        json!({ "boards": { "not-a-uuid": {} } }),
    ] {
        let (status, _) = call(
            &app,
            "PUT",
            "/api/users/me/preferences",
            Some(&alice),
            Some(bad.clone()),
        )
        .await?;
        assert!(status.is_client_error(), "{bad} gave {status}");
    }

    let mut many = serde_json::Map::new();
    for _ in 0..201 {
        many.insert(uuid::Uuid::new_v4().to_string(), json!({}));
    }
    let (status, _) = call(
        &app,
        "PUT",
        "/api/users/me/preferences",
        Some(&alice),
        Some(json!({ "boards": many })),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "per board settings are capped"
    );

    let (status, _) = call(&app, "GET", "/api/users/me/preferences", None, None).await?;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    let (status, _) = call(
        &app,
        "PUT",
        "/api/users/me/preferences",
        None,
        Some(json!({})),
    )
    .await?;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let (_, still) = call(&app, "GET", "/api/users/me/preferences", Some(&alice), None).await?;
    assert_eq!(still["theme"], "system", "refused saves change nothing");

    Ok(())
}

#[tokio::test]
async fn a_board_look_is_shared_and_limited_to_presets_and_writers() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let wen = signed_in_cookie(&app, &pool, "wen@example.com", "wen").await?;
    let rita = signed_in_cookie(&app, &pool, "rita@example.com", "rita").await?;
    let eve = signed_in_cookie(&app, &pool, "eve@example.com", "eve").await?;
    let (workspace_id, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    join_as(&pool, &workspace_id, "wen@example.com", "writer").await?;
    join_as(&pool, &workspace_id, "rita@example.com", "reader").await?;
    let uri = format!("/api/boards/{board_id}/look");

    let (_, view) = call(
        &app,
        "GET",
        &format!("/api/boards/{board_id}"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(
        view["look"],
        json!({ "background": "default", "accent": "teal" })
    );

    let (status, look) = call(
        &app,
        "PUT",
        &uri,
        Some(&wen),
        Some(json!({ "background": "sage", "accent": "violet" })),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::OK,
        "writers can restyle a board: {look}"
    );

    let (_, seen) = call(
        &app,
        "GET",
        &format!("/api/boards/{board_id}"),
        Some(&rita),
        None,
    )
    .await?;
    assert_eq!(
        seen["look"],
        json!({ "background": "sage", "accent": "violet" }),
        "everybody sees it"
    );

    let (status, _) = call(
        &app,
        "PUT",
        &uri,
        Some(&rita),
        Some(json!({ "background": "mist", "accent": "teal" })),
    )
    .await?;
    assert_eq!(status, StatusCode::FORBIDDEN, "readers cannot");
    let (status, _) = call(
        &app,
        "PUT",
        &uri,
        Some(&eve),
        Some(json!({ "background": "mist", "accent": "teal" })),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "strangers cannot even see the board"
    );
    let (status, _) = call(
        &app,
        "PUT",
        &uri,
        None,
        Some(json!({ "background": "mist", "accent": "teal" })),
    )
    .await?;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    for bad in [
        json!({ "background": "#ff0000", "accent": "teal" }),
        json!({ "background": "sage", "accent": "hotpink" }),
        json!({ "background": "sage" }),
        json!({ "background": "sage", "accent": "teal", "extra": 1 }),
    ] {
        let (status, _) = call(&app, "PUT", &uri, Some(&alice), Some(bad.clone())).await?;
        assert!(status.is_client_error(), "{bad} gave {status}");
    }

    let (_, unchanged) = call(
        &app,
        "GET",
        &format!("/api/boards/{board_id}"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(
        unchanged["look"],
        json!({ "background": "sage", "accent": "violet" })
    );

    Ok(())
}

#[tokio::test]
async fn cards_carry_a_short_description_preview() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    let (_, card) = call(
        &app,
        "POST",
        &format!("/api/lists/{list_id}/cards"),
        Some(&alice),
        Some(json!({ "title": "Write" })),
    )
    .await?;
    let card_id = id_of(&card)?;
    assert_eq!(card["description_preview"], "");

    let long = "word ".repeat(100);
    call(
        &app,
        "PATCH",
        &format!("/api/cards/{card_id}"),
        Some(&alice),
        Some(json!({ "description": long })),
    )
    .await?;

    let (_, view) = call(
        &app,
        "GET",
        &format!("/api/boards/{board_id}"),
        Some(&alice),
        None,
    )
    .await?;
    let preview = view["lists"][0]["cards"][0]["description_preview"]
        .as_str()
        .unwrap_or_default();
    assert_eq!(preview.chars().count(), 140, "the preview is cut short");
    assert!(preview.starts_with("word word"));
    assert_eq!(view["lists"][0]["cards"][0]["has_description"], true);

    Ok(())
}
