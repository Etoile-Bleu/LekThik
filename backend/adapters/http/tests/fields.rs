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

async fn new_card(app: &axum::Router, cookie: &str, list_id: &str) -> anyhow::Result<String> {
    let (status, card) = call(
        app,
        "POST",
        &format!("/api/lists/{list_id}/cards"),
        Some(cookie),
        Some(json!({ "title": "Ship it" })),
    )
    .await?;
    anyhow::ensure!(status == StatusCode::CREATED, "card not created");
    id_of(&card)
}

async fn field(
    app: &axum::Router,
    cookie: &str,
    board_id: &str,
    body: Value,
) -> anyhow::Result<(StatusCode, Value)> {
    call(
        app,
        "POST",
        &format!("/api/boards/{board_id}/fields"),
        Some(cookie),
        Some(body),
    )
    .await
}

async fn set(
    app: &axum::Router,
    cookie: &str,
    card_id: &str,
    field_id: &str,
    value: Value,
) -> anyhow::Result<(StatusCode, Value)> {
    call(
        app,
        "PUT",
        &format!("/api/cards/{card_id}/fields/{field_id}"),
        Some(cookie),
        Some(json!({ "value": value })),
    )
    .await
}

fn value_of(view: &Value, card_id: &str, field_id: &str) -> Value {
    view["field_values"]
        .as_array()
        .and_then(|values| {
            values
                .iter()
                .find(|entry| entry["card_id"] == card_id && entry["field_id"] == field_id)
        })
        .map(|entry| entry["value"].clone())
        .unwrap_or(Value::Null)
}

#[tokio::test]
async fn admins_define_fields_and_everyone_reads_them_on_the_board() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let rita = signed_in_cookie(&app, &pool, "rita@example.com", "rita").await?;
    let (workspace_id, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    join(&pool, &workspace_id, "rita@example.com", "reader").await?;

    let (status, size) = field(
        &app,
        &alice,
        &board_id,
        json!({ "name": "  Story size ", "kind": "number", "show_on_card": true }),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED, "{size}");
    assert_eq!(size["name"], "Story size");
    assert_eq!(size["kind"], "number");
    assert_eq!(size["options"], json!([]));

    let (status, env) = field(
        &app,
        &alice,
        &board_id,
        json!({ "name": "Environment", "kind": "select", "options": [
            { "name": "Staging", "color": "amber" }, { "name": "Production", "color": "red" } ] }),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED, "{env}");
    assert_eq!(env["options"][1]["name"], "Production");
    assert_eq!(env["options"][1]["color"], "red");

    let view = board_view(&app, &rita, &board_id).await?;
    let names: Vec<&str> = view["fields"]
        .as_array()
        .map(|fields| fields.iter().filter_map(|f| f["name"].as_str()).collect())
        .unwrap_or_default();
    assert_eq!(
        names,
        vec!["Story size", "Environment"],
        "readers see the fields, in order"
    );
    assert_eq!(view["fields"][0]["show_on_card"], true);
    Ok(())
}

#[tokio::test]
async fn only_admins_manage_fields_and_strangers_learn_nothing() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let wen = signed_in_cookie(&app, &pool, "wen@example.com", "wen").await?;
    let eve = signed_in_cookie(&app, &pool, "eve@example.com", "eve").await?;
    let (workspace_id, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    join(&pool, &workspace_id, "wen@example.com", "writer").await?;
    let (_, made) = field(
        &app,
        &alice,
        &board_id,
        json!({ "name": "Client", "kind": "text" }),
    )
    .await?;
    let uri = format!("/api/boards/{board_id}/fields/{}", id_of(&made)?);

    let (status, _) = field(
        &app,
        &wen,
        &board_id,
        json!({ "name": "Mine", "kind": "text" }),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "writers do not define fields"
    );
    let (status, _) = call(
        &app,
        "PATCH",
        &uri,
        Some(&wen),
        Some(json!({ "name": "Hijack" })),
    )
    .await?;
    assert_eq!(status, StatusCode::FORBIDDEN);
    let (status, _) = call(&app, "DELETE", &uri, Some(&wen), None).await?;
    assert_eq!(status, StatusCode::FORBIDDEN);

    let (status, _) = field(
        &app,
        &eve,
        &board_id,
        json!({ "name": "Mine", "kind": "text" }),
    )
    .await?;
    assert_eq!(status, StatusCode::NOT_FOUND, "strangers learn nothing");
    let (status, _) = call(&app, "DELETE", &uri, Some(&eve), None).await?;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = field(
        &app,
        "",
        &board_id,
        json!({ "name": "Mine", "kind": "text" }),
    )
    .await
    .unwrap_or((StatusCode::UNAUTHORIZED, Value::Null));
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    Ok(())
}

#[tokio::test]
async fn definitions_are_checked_and_names_are_unique_ignoring_case() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    field(
        &app,
        &alice,
        &board_id,
        json!({ "name": "Client", "kind": "text" }),
    )
    .await?;

    for (bad, why) in [
        (
            json!({ "name": "client", "kind": "text" }),
            StatusCode::CONFLICT,
        ),
        (
            json!({ "name": " ", "kind": "text" }),
            StatusCode::BAD_REQUEST,
        ),
        (
            json!({ "name": "x".repeat(61), "kind": "text" }),
            StatusCode::BAD_REQUEST,
        ),
        (
            json!({ "name": "Formula", "kind": "formula" }),
            StatusCode::BAD_REQUEST,
        ),
        (
            json!({ "name": "Opts", "kind": "text", "options": [{ "name": "A", "color": "red" }] }),
            StatusCode::BAD_REQUEST,
        ),
        (
            json!({ "name": "Bad colour", "kind": "select", "options": [{ "name": "A", "color": "chartreuse" }] }),
            StatusCode::BAD_REQUEST,
        ),
        (
            json!({ "name": "Twins", "kind": "select", "options": [
                { "name": "A", "color": "red" }, { "name": "a", "color": "blue" }] }),
            StatusCode::CONFLICT,
        ),
        (
            json!({ "name": "Extra", "kind": "text", "required": true }),
            StatusCode::UNPROCESSABLE_ENTITY,
        ),
    ] {
        let (status, body) = field(&app, &alice, &board_id, bad.clone()).await?;
        assert_eq!(status, why, "{bad} {body}");
    }

    let view = board_view(&app, &alice, &board_id).await?;
    assert_eq!(
        view["fields"].as_array().map(Vec::len),
        Some(1),
        "refused fields leave nothing behind"
    );
    Ok(())
}

#[tokio::test]
async fn a_board_holds_at_most_thirty_fields_and_a_field_fifty_choices() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &alice).await?;

    for index in 0..30 {
        let (status, body) = field(
            &app,
            &alice,
            &board_id,
            json!({ "name": format!("F{index}"), "kind": "text" }),
        )
        .await?;
        assert_eq!(status, StatusCode::CREATED, "{index} {body}");
    }
    let (status, _) = field(
        &app,
        &alice,
        &board_id,
        json!({ "name": "One too many", "kind": "text" }),
    )
    .await?;
    assert_eq!(status, StatusCode::CONFLICT);

    let (_, other) = create_workspace_board_list(&app, &alice)
        .await
        .map(|(_, board, _)| (0, board))?;
    let options: Vec<Value> = (0..51)
        .map(|index| json!({ "name": format!("Option {index}"), "color": "teal" }))
        .collect();
    let (status, _) = field(
        &app,
        &alice,
        &other,
        json!({ "name": "Big", "kind": "select", "options": options }),
    )
    .await?;
    assert_eq!(status, StatusCode::CONFLICT, "fifty-one choices at once");
    Ok(())
}

#[tokio::test]
async fn writers_set_typed_values_and_the_board_reads_them_back() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let wen = signed_in_cookie(&app, &pool, "wen@example.com", "wen").await?;
    let (workspace_id, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    join(&pool, &workspace_id, "wen@example.com", "writer").await?;
    let card = new_card(&app, &alice, &list_id).await?;

    let make = |body: Value| field(&app, &alice, &board_id, body);
    let (_, text) = make(json!({ "name": "Client", "kind": "text" })).await?;
    let (_, number) = make(json!({ "name": "Size", "kind": "number" })).await?;
    let (_, date) = make(json!({ "name": "Release", "kind": "date" })).await?;
    let (_, check) = make(json!({ "name": "Reviewed", "kind": "checkbox" })).await?;
    let (_, link) = make(json!({ "name": "Spec", "kind": "url" })).await?;
    let (_, choice) = make(json!({ "name": "Env", "kind": "select", "options": [{ "name": "Staging", "color": "amber" }] })).await?;
    let staging = choice["options"][0]["id"].clone();

    for (target, value, expect) in [
        (&text, json!("  ACME  "), json!("ACME")),
        (&number, json!("007.50"), json!("7.5")),
        (&date, json!("2026-11-02"), json!("2026-11-02")),
        (&check, json!(true), json!(true)),
        (
            &link,
            json!("HTTPS://Example.com/spec"),
            json!("https://example.com/spec"),
        ),
        (&choice, staging.clone(), staging.clone()),
    ] {
        let (status, saved) = set(&app, &wen, &card, &id_of(target)?, value.clone()).await?;
        assert_eq!(status, StatusCode::OK, "{value} {saved}");
        assert_eq!(saved["value"], expect);
    }

    let view = board_view(&app, &alice, &board_id).await?;
    assert_eq!(
        value_of(&view, &card, &id_of(&number)?),
        json!("7.5"),
        "a number stays an exact decimal string"
    );
    assert_eq!(value_of(&view, &card, &id_of(&check)?), json!(true));
    assert_eq!(value_of(&view, &card, &id_of(&choice)?), staging);

    let (status, cleared) = set(&app, &wen, &card, &id_of(&text)?, Value::Null).await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(cleared["value"], Value::Null);
    let view = board_view(&app, &alice, &board_id).await?;
    assert_eq!(value_of(&view, &card, &id_of(&text)?), Value::Null);
    Ok(())
}

#[tokio::test]
async fn values_that_do_not_fit_are_refused_and_readers_cannot_write() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let rita = signed_in_cookie(&app, &pool, "rita@example.com", "rita").await?;
    let eve = signed_in_cookie(&app, &pool, "eve@example.com", "eve").await?;
    let (workspace_id, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    join(&pool, &workspace_id, "rita@example.com", "reader").await?;
    let (other_workspace, other_board, _) = create_workspace_board_list(&app, &alice).await?;
    let _ = other_workspace;
    let card = new_card(&app, &alice, &list_id).await?;
    let (_, number) = field(
        &app,
        &alice,
        &board_id,
        json!({ "name": "Size", "kind": "number" }),
    )
    .await?;
    let (_, check) = field(
        &app,
        &alice,
        &board_id,
        json!({ "name": "Ok", "kind": "checkbox" }),
    )
    .await?;
    let (_, date) = field(
        &app,
        &alice,
        &board_id,
        json!({ "name": "When", "kind": "date" }),
    )
    .await?;
    let (_, choice) = field(
        &app,
        &alice,
        &board_id,
        json!({ "name": "Env", "kind": "select", "options": [{ "name": "A", "color": "red" }] }),
    )
    .await?;
    let (_, foreign) = field(
        &app,
        &alice,
        &other_board,
        json!({ "name": "Env", "kind": "select", "options": [{ "name": "B", "color": "blue" }] }),
    )
    .await?;

    for (target, value) in [
        (&number, json!("1e3")),
        (&number, json!("1,5")),
        (&number, json!("1000000000000")),
        (&number, json!(5)),
        (&check, json!("true")),
        (&date, json!("2026-02-30")),
        (&choice, json!("not-an-id")),
        (&choice, foreign["options"][0]["id"].clone()),
        (&choice, json!(uuid::Uuid::new_v4().to_string())),
    ] {
        let (status, _) = set(&app, &alice, &card, &id_of(target)?, value.clone()).await?;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{value}");
    }

    let (status, _) = set(&app, &alice, &card, &id_of(&foreign)?, json!("x")).await?;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "a field of another board is not found"
    );
    let (status, _) = set(&app, &rita, &card, &id_of(&number)?, json!("1")).await?;
    assert_eq!(status, StatusCode::FORBIDDEN, "readers read");
    let (status, _) = set(&app, &eve, &card, &id_of(&number)?, json!("1")).await?;
    assert_eq!(status, StatusCode::NOT_FOUND, "strangers learn nothing");
    Ok(())
}

#[tokio::test]
async fn choices_are_renamed_recoloured_and_deleted_without_moving_other_cards()
-> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    let card = new_card(&app, &alice, &list_id).await?;
    let other = new_card(&app, &alice, &list_id).await?;
    let (_, env) = field(
        &app,
        &alice,
        &board_id,
        json!({ "name": "Env", "kind": "select", "options": [
        { "name": "Staging", "color": "amber" }, { "name": "Production", "color": "red" }] }),
    )
    .await?;
    let field_id = id_of(&env)?;
    let staging = env["options"][0]["id"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let production = env["options"][1]["id"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    set(&app, &alice, &card, &field_id, json!(staging)).await?;
    set(&app, &alice, &other, &field_id, json!(production)).await?;
    let base = format!("/api/boards/{board_id}/fields/{field_id}/options");

    let (status, renamed) = call(
        &app,
        "PATCH",
        &format!("{base}/{staging}"),
        Some(&alice),
        Some(json!({ "name": "Pre-prod", "color": "violet" })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK, "{renamed}");
    assert_eq!(renamed["options"][0]["name"], "Pre-prod");
    assert_eq!(renamed["options"][0]["color"], "violet");
    let view = board_view(&app, &alice, &board_id).await?;
    assert_eq!(
        value_of(&view, &card, &field_id),
        json!(staging),
        "the card keeps its choice through a rename"
    );

    let (status, added) = call(
        &app,
        "POST",
        &base,
        Some(&alice),
        Some(json!({ "name": "Dev", "color": "teal" })),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED, "{added}");
    let (status, _) = call(
        &app,
        "POST",
        &base,
        Some(&alice),
        Some(json!({ "name": "dev", "color": "teal" })),
    )
    .await?;
    assert_eq!(status, StatusCode::CONFLICT);

    let (status, left) = call(
        &app,
        "DELETE",
        &format!("{base}/{staging}"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::OK, "{left}");
    assert_eq!(left["options"].as_array().map(Vec::len), Some(2));
    let view = board_view(&app, &alice, &board_id).await?;
    assert_eq!(
        value_of(&view, &card, &field_id),
        Value::Null,
        "deleting a choice clears that value"
    );
    assert_eq!(
        value_of(&view, &other, &field_id),
        json!(production),
        "other cards are untouched"
    );

    let (_, text) = field(
        &app,
        &alice,
        &board_id,
        json!({ "name": "Note", "kind": "text" }),
    )
    .await?;
    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/boards/{board_id}/fields/{}/options", id_of(&text)?),
        Some(&alice),
        Some(json!({ "name": "A", "color": "red" })),
    )
    .await?;
    assert_eq!(status, StatusCode::BAD_REQUEST, "only a select has choices");
    Ok(())
}

#[tokio::test]
async fn fields_are_renamed_reordered_and_deleted_with_their_values() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    let card = new_card(&app, &alice, &list_id).await?;
    let (_, first) = field(
        &app,
        &alice,
        &board_id,
        json!({ "name": "First", "kind": "text" }),
    )
    .await?;
    let (_, second) = field(
        &app,
        &alice,
        &board_id,
        json!({ "name": "Second", "kind": "number" }),
    )
    .await?;
    let (_, third) = field(
        &app,
        &alice,
        &board_id,
        json!({ "name": "Third", "kind": "date" }),
    )
    .await?;
    set(&app, &alice, &card, &id_of(&second)?, json!("4")).await?;

    let (status, moved) = call(
        &app,
        "PATCH",
        &format!("/api/boards/{board_id}/fields/{}", id_of(&third)?),
        Some(&alice),
        Some(json!({ "position": 0, "name": "Zero", "show_on_card": true })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK, "{moved}");
    let view = board_view(&app, &alice, &board_id).await?;
    let names: Vec<&str> = view["fields"]
        .as_array()
        .map(|f| f.iter().filter_map(|x| x["name"].as_str()).collect())
        .unwrap_or_default();
    assert_eq!(names, vec!["Zero", "First", "Second"]);

    let (status, _) = call(
        &app,
        "PATCH",
        &format!("/api/boards/{board_id}/fields/{}", id_of(&first)?),
        Some(&alice),
        Some(json!({ "name": "ZERO" })),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::CONFLICT,
        "a name already used, ignoring case"
    );

    let (status, _) = call(
        &app,
        "DELETE",
        &format!("/api/boards/{board_id}/fields/{}", id_of(&second)?),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let left: i64 = sqlx::query_scalar("SELECT count(*) FROM card_field_values")
        .fetch_one(&pool)
        .await?;
    assert_eq!(left, 0, "the values go with their field");
    let (status, _) = call(
        &app,
        "DELETE",
        &format!("/api/boards/{board_id}/fields/{}", id_of(&second)?),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NOT_FOUND);
    Ok(())
}

#[tokio::test]
async fn a_copied_card_keeps_its_values_and_a_deleted_card_takes_them_away() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    let card = new_card(&app, &alice, &list_id).await?;
    let (_, size) = field(
        &app,
        &alice,
        &board_id,
        json!({ "name": "Size", "kind": "number" }),
    )
    .await?;
    set(&app, &alice, &card, &id_of(&size)?, json!("8")).await?;

    let (status, copy) = call(
        &app,
        "POST",
        &format!("/api/cards/{card}/duplicate"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED, "{copy}");
    let view = board_view(&app, &alice, &board_id).await?;
    assert_eq!(value_of(&view, &id_of(&copy)?, &id_of(&size)?), json!("8"));

    call(
        &app,
        "DELETE",
        &format!("/api/cards/{card}"),
        Some(&alice),
        None,
    )
    .await?;
    let left: i64 = sqlx::query_scalar("SELECT count(*) FROM card_field_values")
        .fetch_one(&pool)
        .await?;
    assert_eq!(left, 1, "only the copy still has its value");
    Ok(())
}

#[tokio::test]
async fn the_database_refuses_a_value_that_fits_no_kind_or_two() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    let card = new_card(&app, &alice, &list_id).await?;
    let (_, size) = field(
        &app,
        &alice,
        &board_id,
        json!({ "name": "Size", "kind": "number" }),
    )
    .await?;

    for sql in [
        "INSERT INTO card_field_values (card_id, field_id) VALUES ($1::uuid, $2::uuid)",
        "INSERT INTO card_field_values (card_id, field_id, number_value, text_value) VALUES ($1::uuid, $2::uuid, 1, 'a')",
        "INSERT INTO card_field_values (card_id, field_id, number_value) VALUES ($1::uuid, $2::uuid, 1000000000000)",
    ] {
        let result = sqlx::query(sql)
            .bind(&card)
            .bind(id_of(&size)?)
            .execute(&pool)
            .await;
        assert!(result.is_err(), "{sql}");
    }
    Ok(())
}
