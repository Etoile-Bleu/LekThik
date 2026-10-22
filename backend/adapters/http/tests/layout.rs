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

async fn user_id_of(pool: &PgPool, email: &str) -> anyhow::Result<String> {
    let id: uuid::Uuid = sqlx::query_scalar("SELECT id FROM users WHERE email = $1")
        .bind(email)
        .fetch_one(pool)
        .await?;
    Ok(id.to_string())
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

#[tokio::test]
async fn a_list_limit_is_shared_validated_and_limited_to_writers() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let wen = signed_in_cookie(&app, &pool, "wen@example.com", "wen").await?;
    let rita = signed_in_cookie(&app, &pool, "rita@example.com", "rita").await?;
    let eve = signed_in_cookie(&app, &pool, "eve@example.com", "eve").await?;
    let (workspace_id, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    join_as(&pool, &workspace_id, "wen@example.com", "writer").await?;
    join_as(&pool, &workspace_id, "rita@example.com", "reader").await?;
    let uri = format!("/api/lists/{list_id}/wip-limit");

    let view = board_view(&app, &alice, &board_id).await?;
    assert_eq!(
        view["lists"][0]["wip_limit"],
        json!(null),
        "no limit at first"
    );

    let (status, list) = call(&app, "PUT", &uri, Some(&wen), Some(json!({ "limit": 3 }))).await?;
    assert_eq!(status, StatusCode::OK, "writers can set a limit: {list}");
    assert_eq!(list["wip_limit"], 3);

    let view = board_view(&app, &rita, &board_id).await?;
    assert_eq!(
        view["lists"][0]["wip_limit"], 3,
        "everyone on the board sees it"
    );

    let (status, _) = call(&app, "PUT", &uri, Some(&rita), Some(json!({ "limit": 9 }))).await?;
    assert_eq!(status, StatusCode::FORBIDDEN, "readers cannot");
    let (status, _) = call(&app, "PUT", &uri, Some(&eve), Some(json!({ "limit": 9 }))).await?;
    assert_eq!(status, StatusCode::NOT_FOUND, "outsiders learn nothing");
    let (status, _) = call(&app, "PUT", &uri, None, Some(json!({ "limit": 9 }))).await?;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    for bad in [
        json!({ "limit": 0 }),
        json!({ "limit": 100 }),
        json!({ "limit": -1 }),
        json!({ "limit": "five" }),
        json!({ "max": 4 }),
        json!({}),
    ] {
        let (status, _) = call(&app, "PUT", &uri, Some(&alice), Some(bad.clone())).await?;
        assert!(
            status.is_client_error() || status == StatusCode::UNPROCESSABLE_ENTITY,
            "{bad} gave {status}"
        );
    }
    let view = board_view(&app, &alice, &board_id).await?;
    assert_eq!(
        view["lists"][0]["wip_limit"], 3,
        "refused values change nothing"
    );

    let (status, list) = call(
        &app,
        "PUT",
        &uri,
        Some(&alice),
        Some(json!({ "limit": null })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(list["wip_limit"], json!(null), "null removes the limit");

    Ok(())
}

#[tokio::test]
async fn a_limit_does_not_stop_cards_from_being_added() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    call(
        &app,
        "PUT",
        &format!("/api/lists/{list_id}/wip-limit"),
        Some(&alice),
        Some(json!({ "limit": 1 })),
    )
    .await?;

    add_card(&app, &alice, &list_id, "One").await?;
    add_card(&app, &alice, &list_id, "Two").await?;

    let view = board_view(&app, &alice, &board_id).await?;
    assert_eq!(view["lists"][0]["cards"].as_array().map(Vec::len), Some(2));

    Ok(())
}

#[tokio::test]
async fn my_cards_lists_only_my_assignments_soonest_first() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let wen = signed_in_cookie(&app, &pool, "wen@example.com", "wen").await?;
    let (workspace_id, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    join_as(&pool, &workspace_id, "wen@example.com", "writer").await?;
    let alice_id = user_id_of(&pool, "alice@example.com").await?;
    let wen_id = user_id_of(&pool, "wen@example.com").await?;

    let later = add_card(&app, &alice, &list_id, "Later").await?;
    let soon = add_card(&app, &alice, &list_id, "Soon").await?;
    let undated = add_card(&app, &alice, &list_id, "Undated").await?;
    let theirs = add_card(&app, &alice, &list_id, "Wen only").await?;
    let nobody = add_card(&app, &alice, &list_id, "Nobody").await?;
    for (card, day) in [(&later, "2026-12-20"), (&soon, "2026-11-02")] {
        call(
            &app,
            "PATCH",
            &format!("/api/cards/{card}"),
            Some(&alice),
            Some(json!({ "due_date": day })),
        )
        .await?;
    }
    for (card, who) in [
        (&later, &alice_id),
        (&soon, &alice_id),
        (&undated, &alice_id),
        (&theirs, &wen_id),
    ] {
        let (status, _) = call(
            &app,
            "PUT",
            &format!("/api/cards/{card}/assignees"),
            Some(&alice),
            Some(json!({ "user_ids": [who] })),
        )
        .await?;
        assert_eq!(status, StatusCode::OK);
    }
    let _ = nobody;

    let (status, mine) = call(&app, "GET", "/api/users/me/cards", Some(&alice), None).await?;
    assert_eq!(status, StatusCode::OK, "{mine}");
    let titles: Vec<&str> = mine
        .as_array()
        .map(|cards| {
            cards
                .iter()
                .filter_map(|card| card["title"].as_str())
                .collect()
        })
        .unwrap_or_default();
    assert_eq!(
        titles,
        vec!["Soon", "Later", "Undated"],
        "dated first, soonest first"
    );
    assert_eq!(mine[0]["due_date"], "2026-11-02");
    assert_eq!(mine[0]["board_id"], board_id);
    assert_eq!(mine[0]["board_name"], "Roadmap");
    assert_eq!(mine[0]["workspace_id"], workspace_id);
    assert_eq!(mine[0]["workspace_name"], "Team");
    assert_eq!(mine[0]["list_name"], "To do");

    let (_, theirs) = call(&app, "GET", "/api/users/me/cards", Some(&wen), None).await?;
    let titles: Vec<&str> = theirs
        .as_array()
        .map(|cards| {
            cards
                .iter()
                .filter_map(|card| card["title"].as_str())
                .collect()
        })
        .unwrap_or_default();
    assert_eq!(titles, vec!["Wen only"], "nobody sees someone else's cards");

    let (status, _) = call(&app, "GET", "/api/users/me/cards", None, None).await?;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    Ok(())
}

#[tokio::test]
async fn my_cards_forgets_workspaces_i_have_left() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let wen = signed_in_cookie(&app, &pool, "wen@example.com", "wen").await?;
    let (workspace_id, _, list_id) = create_workspace_board_list(&app, &alice).await?;
    join_as(&pool, &workspace_id, "wen@example.com", "writer").await?;
    let wen_id = user_id_of(&pool, "wen@example.com").await?;

    let card = add_card(&app, &alice, &list_id, "Shared").await?;
    call(
        &app,
        "PUT",
        &format!("/api/cards/{card}/assignees"),
        Some(&alice),
        Some(json!({ "user_ids": [wen_id] })),
    )
    .await?;
    let (_, before) = call(&app, "GET", "/api/users/me/cards", Some(&wen), None).await?;
    assert_eq!(before.as_array().map(Vec::len), Some(1));

    sqlx::query(
        "DELETE FROM workspace_members WHERE workspace_id = $1::uuid AND user_id = $2::uuid",
    )
    .bind(&workspace_id)
    .bind(&wen_id)
    .execute(&pool)
    .await?;

    let (_, after) = call(&app, "GET", "/api/users/me/cards", Some(&wen), None).await?;
    assert_eq!(
        after.as_array().map(Vec::len),
        Some(0),
        "leaving a workspace takes its cards off the page"
    );

    Ok(())
}

#[tokio::test]
async fn layout_preferences_persist_and_refuse_nonsense() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let board = uuid::Uuid::new_v4().to_string();
    let list = uuid::Uuid::new_v4().to_string();
    let uri = "/api/users/me/preferences";

    let (_, defaults) = call(&app, "GET", uri, Some(&alice), None).await?;
    assert_eq!(
        defaults["card_dialog"],
        json!({ "order": ["assignees", "due_date", "labels", "list"], "hidden": [] })
    );

    let wanted = json!({
        "card_dialog": { "order": ["labels", "due_date", "assignees", "list"], "hidden": ["list"] },
        "boards": { board.clone(): {
            "view": "calendar", "column_width": "narrow", "collapsed_lists": [list.clone()]
        } }
    });
    let (status, saved) = call(&app, "PUT", uri, Some(&alice), Some(wanted)).await?;
    assert_eq!(status, StatusCode::OK, "{saved}");
    assert_eq!(saved["card_dialog"]["order"][0], "labels");
    assert_eq!(saved["boards"][&board]["view"], "calendar");
    assert_eq!(saved["boards"][&board]["column_width"], "narrow");
    assert_eq!(saved["boards"][&board]["collapsed_lists"], json!([list]));
    assert_eq!(
        saved["boards"][&board]["card_display"],
        json!(null),
        "a board that only sets its layout keeps the general card display"
    );

    for bad in [
        json!({ "boards": { board.clone(): { "view": "gantt" } } }),
        json!({ "boards": { board.clone(): { "column_width": "huge" } } }),
        json!({ "card_dialog": { "order": ["comments"] } }),
        json!({ "card_dialog": { "order": ["labels", "labels"] } }),
        json!({ "card_dialog": { "hidden": ["list", "list"] } }),
        json!({ "boards": { board.clone(): { "collapsed_lists": ["not-a-uuid"] } } }),
    ] {
        let (status, _) = call(&app, "PUT", uri, Some(&alice), Some(bad.clone())).await?;
        assert!(status.is_client_error(), "{bad} gave {status}");
    }

    let many: Vec<String> = (0..51).map(|_| uuid::Uuid::new_v4().to_string()).collect();
    let (status, _) = call(
        &app,
        "PUT",
        uri,
        Some(&alice),
        Some(json!({ "boards": { board.clone(): { "collapsed_lists": many } } })),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "collapsed lists are capped"
    );

    let (_, still) = call(&app, "GET", uri, Some(&alice), None).await?;
    assert_eq!(
        still["boards"][&board]["view"], "calendar",
        "refused saves change nothing"
    );

    Ok(())
}
