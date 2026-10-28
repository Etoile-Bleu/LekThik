mod common;

use axum::http::StatusCode;
use common::{board_view, call, create_workspace_board_list, id_of, signed_in_cookie, spawn_app};
use serde_json::{Value, json};
use sqlx::PgPool;

async fn join(pool: &PgPool, workspace_id: &str, email: &str, role: &str) -> anyhow::Result<()> {
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

fn lunch(show_voters: bool) -> Value {
    json!({
        "question": "Where do we eat?",
        "options": [
            { "id": "pizza", "text": "Pizza" },
            { "id": "ramen", "text": "Ramen" },
            { "id": "salad", "text": "Salad" }
        ],
        "show_voters": show_voters
    })
}

async fn poll(
    app: &axum::Router,
    cookie: &str,
    board_id: &str,
    config: Value,
) -> anyhow::Result<(StatusCode, Value)> {
    call(
        app,
        "POST",
        &format!("/api/boards/{board_id}/blocks"),
        Some(cookie),
        Some(json!({ "kind": "poll", "name": "Lunch", "config": config })),
    )
    .await
}

async fn vote(
    app: &axum::Router,
    cookie: &str,
    list_id: &str,
    option: &str,
) -> anyhow::Result<StatusCode> {
    let (status, _) = call(
        app,
        "PUT",
        &format!("/api/lists/{list_id}/poll/vote"),
        Some(cookie),
        Some(json!({ "option_id": option })),
    )
    .await?;
    Ok(status)
}

async fn tally(
    app: &axum::Router,
    cookie: &str,
    board_id: &str,
    list_id: &str,
) -> anyhow::Result<Value> {
    let view = board_view(app, cookie, board_id).await?;
    view["polls"]
        .as_array()
        .and_then(|polls| polls.iter().find(|entry| entry["list_id"] == list_id))
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("no tally for {list_id}: {view}"))
}

fn votes_for(tally: &Value, option: &str) -> i64 {
    tally["counts"]
        .as_array()
        .and_then(|counts| counts.iter().find(|entry| entry["option_id"] == option))
        .and_then(|entry| entry["votes"].as_i64())
        .unwrap_or(-1)
}

#[tokio::test]
async fn members_vote_once_and_the_board_carries_the_tally() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let wen = signed_in_cookie(&app, &pool, "wen@example.com", "wen").await?;
    let (workspace_id, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    join(&pool, &workspace_id, "wen@example.com", "writer").await?;

    let (status, made) = poll(&app, &alice, &board_id, lunch(false)).await?;
    assert_eq!(status, StatusCode::CREATED, "{made}");
    let list_id = id_of(&made)?;

    let empty = tally(&app, &alice, &board_id, &list_id).await?;
    assert_eq!(empty["total"], 0);
    assert_eq!(empty["mine"], Value::Null);

    assert_eq!(
        vote(&app, &alice, &list_id, "pizza").await?,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        vote(&app, &wen, &list_id, "pizza").await?,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        vote(&app, &alice, &list_id, "ramen").await?,
        StatusCode::NO_CONTENT,
        "voting again moves the vote"
    );

    let seen = tally(&app, &alice, &board_id, &list_id).await?;
    assert_eq!(seen["total"], 2);
    assert_eq!(votes_for(&seen, "pizza"), 1);
    assert_eq!(votes_for(&seen, "ramen"), 1);
    assert_eq!(votes_for(&seen, "salad"), 0);
    assert_eq!(seen["mine"], "ramen");
    assert_eq!(
        tally(&app, &wen, &board_id, &list_id).await?["mine"],
        "pizza"
    );
    assert_eq!(
        seen["voters"],
        Value::Null,
        "an anonymous poll never names anyone"
    );

    let (status, _) = call(
        &app,
        "DELETE",
        &format!("/api/lists/{list_id}/poll/vote"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let after = tally(&app, &alice, &board_id, &list_id).await?;
    assert_eq!(after["total"], 1);
    assert_eq!(after["mine"], Value::Null);
    Ok(())
}

#[tokio::test]
async fn readers_may_vote_and_strangers_learn_nothing() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let rita = signed_in_cookie(&app, &pool, "rita@example.com", "rita").await?;
    let eve = signed_in_cookie(&app, &pool, "eve@example.com", "eve").await?;
    let (workspace_id, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    join(&pool, &workspace_id, "rita@example.com", "reader").await?;
    let (_, made) = poll(&app, &alice, &board_id, lunch(false)).await?;
    let list_id = id_of(&made)?;

    assert_eq!(
        vote(&app, &rita, &list_id, "salad").await?,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        votes_for(&tally(&app, &alice, &board_id, &list_id).await?, "salad"),
        1
    );

    assert_eq!(
        vote(&app, &eve, &list_id, "salad").await?,
        StatusCode::NOT_FOUND
    );
    let (status, _) = call(
        &app,
        "DELETE",
        &format!("/api/lists/{list_id}/poll/vote"),
        Some(&eve),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NOT_FOUND);
    Ok(())
}

#[tokio::test]
async fn a_vote_must_name_an_option_of_the_poll() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, plain_list) = create_workspace_board_list(&app, &alice).await?;
    let (_, made) = poll(&app, &alice, &board_id, lunch(false)).await?;
    let list_id = id_of(&made)?;

    assert_eq!(
        vote(&app, &alice, &list_id, "sushi").await?,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        vote(&app, &alice, &plain_list, "pizza").await?,
        StatusCode::NOT_FOUND,
        "an ordinary list is not a poll"
    );
    assert_eq!(tally(&app, &alice, &board_id, &list_id).await?["total"], 0);
    Ok(())
}

#[tokio::test]
async fn a_closed_poll_takes_no_votes_until_it_is_reopened() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    let (_, made) = poll(&app, &alice, &board_id, lunch(false)).await?;
    let list_id = id_of(&made)?;
    vote(&app, &alice, &list_id, "pizza").await?;

    let config_uri = format!("/api/blocks/{list_id}/config");
    let mut closed = lunch(false);
    closed["closed"] = json!(true);
    let (status, _) = call(
        &app,
        "PUT",
        &config_uri,
        Some(&alice),
        Some(json!({ "kind": "poll", "config": closed })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);

    assert_eq!(
        vote(&app, &alice, &list_id, "ramen").await?,
        StatusCode::CONFLICT
    );
    let (status, _) = call(
        &app,
        "DELETE",
        &format!("/api/lists/{list_id}/poll/vote"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::CONFLICT);
    let kept = tally(&app, &alice, &board_id, &list_id).await?;
    assert_eq!(kept["mine"], "pizza", "closing keeps the results");

    let (status, _) = call(
        &app,
        "PUT",
        &config_uri,
        Some(&alice),
        Some(json!({ "kind": "poll", "config": lunch(false) })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        vote(&app, &alice, &list_id, "ramen").await?,
        StatusCode::NO_CONTENT
    );
    Ok(())
}

#[tokio::test]
async fn removing_an_option_drops_its_votes() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let wen = signed_in_cookie(&app, &pool, "wen@example.com", "wen").await?;
    let (workspace_id, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    join(&pool, &workspace_id, "wen@example.com", "writer").await?;
    let (_, made) = poll(&app, &alice, &board_id, lunch(false)).await?;
    let list_id = id_of(&made)?;
    vote(&app, &alice, &list_id, "pizza").await?;
    vote(&app, &wen, &list_id, "salad").await?;

    let config = json!({
        "question": "Where do we eat?",
        "options": [ { "id": "pizza", "text": "Pizza" }, { "id": "ramen", "text": "Ramen" } ]
    });
    let (status, _) = call(
        &app,
        "PUT",
        &format!("/api/blocks/{list_id}/config"),
        Some(&alice),
        Some(json!({ "kind": "poll", "config": config })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);

    let seen = tally(&app, &alice, &board_id, &list_id).await?;
    assert_eq!(seen["total"], 1, "the vote for the removed option is gone");
    assert_eq!(votes_for(&seen, "pizza"), 1);
    assert_eq!(
        tally(&app, &wen, &board_id, &list_id).await?["mine"],
        Value::Null
    );
    Ok(())
}

#[tokio::test]
async fn names_are_shown_only_when_the_poll_asked_for_it_and_cannot_change_after_a_vote()
-> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    let (_, open) = poll(&app, &alice, &board_id, lunch(true)).await?;
    let open_id = id_of(&open)?;
    let (_, hidden) = poll(&app, &alice, &board_id, lunch(false)).await?;
    let hidden_id = id_of(&hidden)?;
    vote(&app, &alice, &open_id, "ramen").await?;
    vote(&app, &alice, &hidden_id, "ramen").await?;

    let named = tally(&app, &alice, &board_id, &open_id).await?;
    let ramen = named["voters"]
        .as_array()
        .and_then(|voters| voters.iter().find(|entry| entry["option_id"] == "ramen"))
        .cloned()
        .unwrap_or(Value::Null);
    assert_eq!(ramen["user_ids"].as_array().map(Vec::len), Some(1));
    assert_eq!(
        tally(&app, &alice, &board_id, &hidden_id).await?["voters"],
        Value::Null
    );

    let (status, body) = call(
        &app,
        "PUT",
        &format!("/api/blocks/{hidden_id}/config"),
        Some(&alice),
        Some(json!({ "kind": "poll", "config": lunch(true) })),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::CONFLICT,
        "an anonymous poll cannot start naming people once voted in: {body}"
    );
    let (status, _) = call(
        &app,
        "PUT",
        &format!("/api/blocks/{open_id}/config"),
        Some(&alice),
        Some(json!({ "kind": "poll", "config": lunch(false) })),
    )
    .await?;
    assert_eq!(status, StatusCode::CONFLICT);
    Ok(())
}

#[tokio::test]
async fn a_poll_needs_a_question_and_two_to_ten_distinct_options() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    let many: Vec<Value> = (0..11)
        .map(|index| json!({ "id": format!("o{index}"), "text": format!("Option {index}") }))
        .collect();

    let cases = [
        json!({ "question": "", "options": lunch(false)["options"] }),
        json!({ "question": "Alone?", "options": [ { "id": "a", "text": "Yes" } ] }),
        json!({ "question": "Too many", "options": many }),
        json!({ "question": "Twins", "options": [ { "id": "a", "text": "Same" }, { "id": "b", "text": "same" } ] }),
        json!({ "question": "Ids", "options": [ { "id": "a", "text": "One" }, { "id": "a", "text": "Two" } ] }),
        json!({ "question": "Odd id", "options": [ { "id": "A B", "text": "One" }, { "id": "b", "text": "Two" } ] }),
        json!({ "question": "Extra", "options": lunch(false)["options"], "open": true }),
    ];
    for bad in cases {
        let (status, body) = poll(&app, &alice, &board_id, bad.clone()).await?;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{bad} gave {body}");
    }
    Ok(())
}

#[tokio::test]
async fn votes_leave_with_the_account_that_cast_them() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let wen = signed_in_cookie(&app, &pool, "wen@example.com", "wen").await?;
    let (workspace_id, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    join(&pool, &workspace_id, "wen@example.com", "writer").await?;
    let (_, made) = poll(&app, &alice, &board_id, lunch(false)).await?;
    let list_id = id_of(&made)?;
    vote(&app, &wen, &list_id, "pizza").await?;

    sqlx::query("DELETE FROM users WHERE email = 'wen@example.com'")
        .execute(&pool)
        .await?;

    assert_eq!(tally(&app, &alice, &board_id, &list_id).await?["total"], 0);
    Ok(())
}
