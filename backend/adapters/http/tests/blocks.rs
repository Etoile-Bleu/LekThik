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
async fn an_overdue_block_takes_a_size_and_nothing_that_names_a_person() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    let uri = format!("/api/boards/{board_id}/blocks");

    let (status, plain) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({ "kind": "overdue", "name": "Late for me" })),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED, "{plain}");
    assert_eq!(plain["config"], json!({ "size": "normal" }));

    let (status, wide) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({ "kind": "overdue", "name": "Late", "config": { "size": "wide" } })),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED, "{wide}");
    assert_eq!(wide["config"]["size"], "wide");

    let (status, _) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({ "kind": "overdue", "name": "Late", "config": { "user_id": "someone" } })),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "the block follows whoever looks, it cannot be pointed at a person"
    );

    Ok(())
}

#[tokio::test]
async fn a_chart_block_keeps_what_it_counts_and_refuses_the_rest() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    let uri = format!("/api/boards/{board_id}/blocks");

    let (status, plain) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({ "kind": "chart", "name": "Where the work is" })),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED, "{plain}");
    assert_eq!(
        plain["config"],
        json!({ "size": "normal", "source": "list", "style": "bars" })
    );

    let (status, donut) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({ "kind": "chart", "name": "Who has what",
            "config": { "source": "assignee", "style": "donut" } })),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED, "{donut}");
    assert_eq!(donut["config"]["source"], "assignee");

    let id = id_of(&donut)?;
    let (status, changed) = call(
        &app,
        "PUT",
        &format!("/api/blocks/{id}/config"),
        Some(&alice),
        Some(json!({ "kind": "chart", "config": { "source": "due", "style": "bars" } })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK, "{changed}");
    assert_eq!(changed["config"]["source"], "due");

    for bad in [
        json!({ "source": "priority" }),
        json!({ "style": "pie" }),
        json!({ "title": "x" }),
    ] {
        let (status, _) = call(
            &app,
            "POST",
            &uri,
            Some(&alice),
            Some(json!({ "kind": "chart", "name": "Nope", "config": bad })),
        )
        .await?;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{bad}");
    }

    Ok(())
}

#[tokio::test]
async fn a_snippet_block_keeps_its_code_and_refuses_what_is_unsafe_or_too_big() -> anyhow::Result<()>
{
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    let uri = format!("/api/boards/{board_id}/blocks");
    let code = "<script>alert(1)</script>\n\tSELECT * FROM cards;\n";

    let (status, snippet) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({ "kind": "snippet", "name": "Query",
            "config": { "language": "sql", "filename": "cards.sql", "code": code, "line_numbers": true } })),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED, "{snippet}");
    assert_eq!(
        snippet["config"]["code"], code,
        "code is stored as plain text, untouched"
    );
    assert_eq!(snippet["config"]["language"], "sql");

    let view = board_view(&app, &alice, &board_id).await?;
    assert_eq!(view["lists"][1]["config"]["filename"], "cards.sql");

    let id = id_of(&snippet)?;
    let (status, changed) = call(
        &app,
        "PUT",
        &format!("/api/blocks/{id}/config"),
        Some(&alice),
        Some(json!({ "kind": "snippet", "config": { "language": "rust", "code": "fn main() {}\r\n" } })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK, "{changed}");
    assert_eq!(changed["config"]["code"], "fn main() {}\n");

    for bad in [
        json!({ "code": "x".repeat(12_001) }),
        json!({ "code": "a\n".repeat(501) }),
        json!({ "code": "nul\u{0}" }),
        json!({ "language": "brainfuck" }),
        json!({ "execute": true }),
    ] {
        let (status, _) = call(
            &app,
            "POST",
            &uri,
            Some(&alice),
            Some(json!({ "kind": "snippet", "name": "Nope", "config": bad })),
        )
        .await?;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{bad}");
    }

    Ok(())
}

#[tokio::test]
async fn a_table_block_keeps_its_cells_as_text_and_enforces_its_limits() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    let uri = format!("/api/boards/{board_id}/blocks");

    let (status, table) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({ "kind": "table", "name": "Budget",
            "config": { "rows": [["Item", "Cost"], ["=1+1", "800"], ["Food"]] } })),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED, "{table}");
    assert_eq!(
        table["config"]["rows"],
        json!([["Item", "Cost"], ["=1+1", "800"], ["Food", ""]]),
        "a formula stays text and a short row is padded"
    );

    let id = id_of(&table)?;
    let (status, changed) = call(
        &app,
        "PUT",
        &format!("/api/blocks/{id}/config"),
        Some(&alice),
        Some(json!({ "kind": "table", "config": { "header": false, "rows": [["a", "b"]] } })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK, "{changed}");
    assert_eq!(changed["config"]["header"], false);

    let too_wide: Vec<String> = (0..13).map(|_| "a".to_string()).collect();
    let too_tall: Vec<Vec<String>> = (0..101).map(|_| vec!["a".to_string()]).collect();
    for bad in [
        json!({ "rows": [too_wide] }),
        json!({ "rows": too_tall }),
        json!({ "rows": [["x".repeat(201)]] }),
        json!({ "rows": [["a\tb"]] }),
        json!({ "rows": [[1]] }),
        json!({ "formulas": true }),
    ] {
        let (status, _) = call(
            &app,
            "POST",
            &uri,
            Some(&alice),
            Some(json!({ "kind": "table", "name": "Nope", "config": bad })),
        )
        .await?;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{bad}");
    }

    Ok(())
}

#[tokio::test]
async fn excalidraw_figma_and_notion_embeds_are_stored_as_identifiers_only() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    let uri = format!("/api/boards/{board_id}/blocks");

    for (url, provider, id) in [
        (
            "https://excalidraw.com/#json=AbCdEf12345,Zx9Yw8Vu7Ts6Rq5Pn4Om3Lk",
            "excalidraw",
            "json=AbCdEf12345,Zx9Yw8Vu7Ts6Rq5Pn4Om3Lk",
        ),
        (
            "https://www.figma.com/design/AbCdEf1234567890xyz/Home-page?node-id=1-2",
            "figma",
            "design/AbCdEf1234567890xyz",
        ),
        (
            "https://acme.notion.site/Roadmap-0123456789abcdef0123456789abcdef",
            "notion",
            "acme/0123456789abcdef0123456789abcdef",
        ),
    ] {
        let (status, embed) = call(
            &app,
            "POST",
            &uri,
            Some(&alice),
            Some(json!({ "kind": "embed", "name": "Outside", "config": { "url": url, "title": "Outside content" } })),
        )
        .await?;
        assert_eq!(status, StatusCode::CREATED, "{embed}");
        assert_eq!(embed["config"]["provider"], provider);
        assert_eq!(
            embed["config"]["id"], id,
            "only the identifier is kept, never the address"
        );
        assert!(
            embed["config"].get("url").is_none(),
            "the address a person typed is not stored"
        );
    }

    for url in [
        "https://www.notion.so/Roadmap-0123456789abcdef0123456789abcdef",
        "https://excalidraw.com/#json=abc,def",
        "https://www.figma.com/community/file/1234567890123",
        "https://evil.example/#json=AbCdEf12345,Zx9Yw8Vu7Ts6Rq5Pn4Om3Lk",
    ] {
        let (status, _) = call(
            &app,
            "POST",
            &uri,
            Some(&alice),
            Some(
                json!({ "kind": "embed", "name": "Nope", "config": { "url": url, "title": "x" } }),
            ),
        )
        .await?;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{url}");
    }

    Ok(())
}

#[tokio::test]
async fn a_clocks_block_keeps_zones_and_a_rounded_place_and_refuses_odd_ones() -> anyhow::Result<()>
{
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    let uri = format!("/api/boards/{board_id}/blocks");

    let (status, clocks) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({ "kind": "clocks", "name": "Team time",
            "config": {
                "zones": ["Europe/Paris", "Asia/Tokyo"],
                "place": { "name": "Paris", "latitude_centi": 4886, "longitude_centi": 235 }
            } })),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED, "{clocks}");
    assert_eq!(
        clocks["config"]["zones"],
        json!(["Europe/Paris", "Asia/Tokyo"])
    );
    assert_eq!(clocks["config"]["place"]["latitude_centi"], 4886);

    let (status, bare) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({ "kind": "clocks", "name": "Empty" })),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED, "{bare}");
    assert_eq!(bare["config"]["place"], serde_json::Value::Null);

    for bad in [
        json!({ "zones": ["Europe/Paris", "Europe/Paris"] }),
        json!({ "zones": ["../etc/passwd"] }),
        json!({ "zones": ["Europe/Paris\n"] }),
        json!({ "place": { "name": "x", "latitude_centi": 9100, "longitude_centi": 0 } }),
        json!({ "place": { "name": "x", "latitude_centi": 48.86, "longitude_centi": 2.35 } }),
    ] {
        let (status, _) = call(
            &app,
            "POST",
            &uri,
            Some(&alice),
            Some(json!({ "kind": "clocks", "name": "Nope", "config": bad })),
        )
        .await?;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{bad}");
    }

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
