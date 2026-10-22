mod common;

use std::time::Duration;

use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use common::{
    RecordingMailer, call, create_workspace_board_list, id_of, signed_in_cookie, spawn_app,
    spawn_app_with_mailer, with_connect_info,
};
use futures_util::StreamExt;
use serde_json::json;
use tower::ServiceExt;

/// Invites `email` and returns the invitation id taken from the email link.
async fn invite(
    app: &axum::Router,
    mailer: &RecordingMailer,
    cookie: &str,
    workspace_id: &str,
    email: &str,
    role: &str,
) -> anyhow::Result<String> {
    let (status, body) = call(
        app,
        "POST",
        &format!("/api/workspaces/{workspace_id}/invitations"),
        Some(cookie),
        Some(json!({ "email": email, "role": role })),
    )
    .await?;
    anyhow::ensure!(status == StatusCode::CREATED, "invite failed: {body}");

    let sent = mailer.sent();
    let message = sent
        .iter()
        .rev()
        .find(|message| message.to == email.to_lowercase())
        .ok_or_else(|| anyhow::anyhow!("no invitation email for {email}"))?;
    anyhow::ensure!(
        message
            .text_body
            .contains(&format!("https://app.test/invitations/{}", id_of(&body)?)),
        "email does not link to the invitation"
    );

    id_of(&body)
}

async fn accept(app: &axum::Router, cookie: &str, invitation_id: &str) -> anyhow::Result<()> {
    let (status, body) = call(
        app,
        "POST",
        &format!("/api/invitations/{invitation_id}/accept"),
        Some(cookie),
        None,
    )
    .await?;
    anyhow::ensure!(status == StatusCode::OK, "accept failed: {body}");
    Ok(())
}

/// Reads the event stream until `needle` appears, or fails after a short wait.
async fn wait_for_event(
    stream: &mut (impl futures_util::Stream<Item = Result<axum::body::Bytes, axum::Error>> + Unpin),
    needle: &str,
) -> anyhow::Result<String> {
    let mut seen = String::new();
    let result = tokio::time::timeout(Duration::from_secs(5), async {
        while let Some(chunk) = stream.next().await {
            seen.push_str(&String::from_utf8_lossy(&chunk?));
            if seen.contains(needle) {
                return Ok::<_, anyhow::Error>(());
            }
        }
        Ok(())
    })
    .await;

    anyhow::ensure!(
        matches!(result, Ok(Ok(()))) && seen.contains(needle),
        "never saw {needle}, got {seen:?}"
    );
    Ok(seen)
}

async fn open_stream(
    app: &axum::Router,
    cookie: &str,
) -> anyhow::Result<impl futures_util::Stream<Item = Result<axum::body::Bytes, axum::Error>> + Unpin>
{
    let response = app
        .clone()
        .oneshot(with_connect_info(
            Request::builder()
                .method("GET")
                .uri("/api/events")
                .header(header::COOKIE, cookie)
                .body(Body::empty())?,
        ))
        .await?;
    anyhow::ensure!(response.status() == StatusCode::OK, "stream refused");

    Ok(Box::pin(response.into_body().into_data_stream()))
}

#[tokio::test]
async fn an_invited_person_accepts_and_works_in_the_workspace() -> anyhow::Result<()> {
    let (app, pool, _container, mailer) = spawn_app_with_mailer().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let bob = signed_in_cookie(&app, &pool, "bob@example.com", "bob").await?;
    let (workspace_id, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;

    let (status, _) = call(
        &app,
        "GET",
        &format!("/api/boards/{board_id}"),
        Some(&bob),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NOT_FOUND, "bob sees nothing yet");

    let invitation_id = invite(
        &app,
        &mailer,
        &alice,
        &workspace_id,
        "Bob@Example.com",
        "writer",
    )
    .await?;

    let (_, mine) = call(&app, "GET", "/api/invitations", Some(&bob), None).await?;
    assert_eq!(mine[0]["id"], invitation_id.as_str());
    assert_eq!(mine[0]["workspace_name"], "Team");
    assert_eq!(mine[0]["role"], "writer");

    accept(&app, &bob, &invitation_id).await?;

    let (_, workspaces) = call(&app, "GET", "/api/workspaces", Some(&bob), None).await?;
    assert_eq!(workspaces[0]["role"], "writer");
    assert_eq!(workspaces[0]["boards"][0]["id"], board_id.as_str());

    let (status, card) = call(
        &app,
        "POST",
        &format!("/api/lists/{list_id}/cards"),
        Some(&bob),
        Some(json!({ "title": "From Bob" })),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::CREATED,
        "a writer edits content: {card}"
    );

    let (_, view) = call(
        &app,
        "GET",
        &format!("/api/boards/{board_id}"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(view["lists"][0]["cards"][0]["title"], "From Bob");
    assert_eq!(view["role"], "owner");

    let (status, _) = call(
        &app,
        "PATCH",
        &format!("/api/workspaces/{workspace_id}"),
        Some(&bob),
        Some(json!({ "name": "Hijack" })),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "a writer cannot rename the workspace"
    );

    let (status, _) = call(
        &app,
        "DELETE",
        &format!("/api/boards/{board_id}"),
        Some(&bob),
        None,
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "a writer cannot delete a board"
    );

    let (status, _) = call(
        &app,
        "DELETE",
        &format!("/api/workspaces/{workspace_id}"),
        Some(&bob),
        None,
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "only the owner deletes the workspace"
    );

    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/workspaces/{workspace_id}/invitations"),
        Some(&bob),
        Some(json!({ "email": "eve@example.com", "role": "reader" })),
    )
    .await?;
    assert_eq!(status, StatusCode::FORBIDDEN, "a writer cannot invite");

    Ok(())
}

#[tokio::test]
async fn readers_can_look_but_not_touch() -> anyhow::Result<()> {
    let (app, pool, _container, mailer) = spawn_app_with_mailer().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let rita = signed_in_cookie(&app, &pool, "rita@example.com", "rita").await?;
    let (workspace_id, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    let (_, card) = call(
        &app,
        "POST",
        &format!("/api/lists/{list_id}/cards"),
        Some(&alice),
        Some(json!({ "title": "Existing" })),
    )
    .await?;
    let card_id = id_of(&card)?;

    let invitation_id = invite(
        &app,
        &mailer,
        &alice,
        &workspace_id,
        "rita@example.com",
        "reader",
    )
    .await?;
    accept(&app, &rita, &invitation_id).await?;

    let (status, view) = call(
        &app,
        "GET",
        &format!("/api/boards/{board_id}"),
        Some(&rita),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(view["role"], "reader");

    let (status, _) = call(
        &app,
        "GET",
        &format!("/api/cards/{card_id}"),
        Some(&rita),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::OK);

    let writes = [
        (
            "POST",
            format!("/api/boards/{board_id}/lists"),
            Some(json!({ "name": "X" })),
        ),
        (
            "PATCH",
            format!("/api/lists/{list_id}"),
            Some(json!({ "name": "X" })),
        ),
        ("DELETE", format!("/api/lists/{list_id}"), None),
        (
            "POST",
            format!("/api/lists/{list_id}/cards"),
            Some(json!({ "title": "X" })),
        ),
        (
            "PATCH",
            format!("/api/cards/{card_id}"),
            Some(json!({ "title": "X" })),
        ),
        ("DELETE", format!("/api/cards/{card_id}"), None),
        (
            "POST",
            format!("/api/boards/{board_id}/labels"),
            Some(json!({ "name": "X", "color": "red", "priority": "high" })),
        ),
        (
            "POST",
            format!("/api/workspaces/{workspace_id}/boards"),
            Some(json!({ "name": "X" })),
        ),
        (
            "PATCH",
            format!("/api/boards/{board_id}"),
            Some(json!({ "name": "X" })),
        ),
    ];
    for (method, uri, body) in writes {
        let (status, _) = call(&app, method, &uri, Some(&rita), body).await?;
        assert_eq!(status, StatusCode::FORBIDDEN, "{method} {uri}");
    }

    let (_, view) = call(
        &app,
        "GET",
        &format!("/api/boards/{board_id}"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(view["lists"][0]["name"], "To do");
    assert_eq!(view["lists"][0]["cards"][0]["title"], "Existing");

    Ok(())
}

#[tokio::test]
async fn only_the_invited_verified_address_can_answer() -> anyhow::Result<()> {
    let (app, pool, _container, mailer) = spawn_app_with_mailer().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let mallory = signed_in_cookie(&app, &pool, "mallory@example.com", "mallory").await?;
    let (workspace_id, _, _) = create_workspace_board_list(&app, &alice).await?;
    let invitation_id = invite(
        &app,
        &mailer,
        &alice,
        &workspace_id,
        "bob@example.com",
        "reader",
    )
    .await?;

    for path in [format!("/api/invitations/{invitation_id}")] {
        let (status, _) = call(&app, "GET", &path, Some(&mallory), None).await?;
        assert_eq!(status, StatusCode::NOT_FOUND, "{path}");
    }
    for action in ["accept", "decline"] {
        let (status, _) = call(
            &app,
            "POST",
            &format!("/api/invitations/{invitation_id}/{action}"),
            Some(&mallory),
            None,
        )
        .await?;
        assert_eq!(status, StatusCode::NOT_FOUND, "{action}");
    }
    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/invitations/{invitation_id}/accept"),
        None,
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // Bob registers after the invitation was sent but has not verified the address.
    let registered = app
        .clone()
        .oneshot(common::register_request(
            "bob@example.com",
            "bob",
            "a-strong-password",
        )?)
        .await?;
    assert_eq!(registered.status(), StatusCode::CREATED);
    common::mark_email_verified(&pool, "bob@example.com").await?;
    let login = app
        .clone()
        .oneshot(common::login_request(
            "bob@example.com",
            "a-strong-password",
        )?)
        .await?;
    let bob = common::session_cookie_from(&login).ok_or_else(|| anyhow::anyhow!("no cookie"))?;
    sqlx::query("UPDATE users SET email_verified_at = NULL WHERE email = 'bob@example.com'")
        .execute(&pool)
        .await?;

    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/invitations/{invitation_id}/accept"),
        Some(&bob),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::FORBIDDEN, "unverified address");

    common::mark_email_verified(&pool, "bob@example.com").await?;
    accept(&app, &bob, &invitation_id).await?;

    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/invitations/{invitation_id}/accept"),
        Some(&bob),
        None,
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::CONFLICT,
        "answered invitations are closed"
    );

    Ok(())
}

#[tokio::test]
async fn declined_revoked_and_expired_invitations_grant_nothing() -> anyhow::Result<()> {
    let (app, pool, _container, mailer) = spawn_app_with_mailer().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let bob = signed_in_cookie(&app, &pool, "bob@example.com", "bob").await?;
    let (workspace_id, board_id, _) = create_workspace_board_list(&app, &alice).await?;

    let declined = invite(
        &app,
        &mailer,
        &alice,
        &workspace_id,
        "bob@example.com",
        "reader",
    )
    .await?;
    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/invitations/{declined}/decline"),
        Some(&bob),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    let (_, mine) = call(&app, "GET", "/api/invitations", Some(&bob), None).await?;
    assert_eq!(mine, json!([]));

    let revoked = invite(
        &app,
        &mailer,
        &alice,
        &workspace_id,
        "bob@example.com",
        "reader",
    )
    .await?;
    let (_, overview) = call(
        &app,
        "GET",
        &format!("/api/workspaces/{workspace_id}/members"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(overview["invitations"][0]["id"], revoked.as_str());
    let (status, _) = call(
        &app,
        "DELETE",
        &format!("/api/workspaces/{workspace_id}/invitations/{revoked}"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/invitations/{revoked}/accept"),
        Some(&bob),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::CONFLICT);

    let expired = invite(
        &app,
        &mailer,
        &alice,
        &workspace_id,
        "bob@example.com",
        "reader",
    )
    .await?;
    sqlx::query("UPDATE workspace_invitations SET expires_at = now() - interval '1 minute' WHERE id = $1::uuid")
        .bind(&expired)
        .execute(&pool)
        .await?;
    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/invitations/{expired}/accept"),
        Some(&bob),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::CONFLICT);

    let (status, _) = call(
        &app,
        "GET",
        &format!("/api/boards/{board_id}"),
        Some(&bob),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NOT_FOUND, "nothing was granted");

    Ok(())
}

#[tokio::test]
async fn inviting_validates_and_never_duplicates() -> anyhow::Result<()> {
    let (app, pool, _container, mailer) = spawn_app_with_mailer().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let stranger = signed_in_cookie(&app, &pool, "stranger@example.com", "stranger").await?;
    let (workspace_id, _, _) = create_workspace_board_list(&app, &alice).await?;
    let uri = format!("/api/workspaces/{workspace_id}/invitations");

    for body in [
        json!({ "email": "not-an-email", "role": "reader" }),
        json!({ "email": "bob@example.com", "role": "owner" }),
        json!({ "email": "bob@example.com", "role": "root" }),
        json!({ "email": "bob@example.com" }),
    ] {
        let (status, _) = call(&app, "POST", &uri, Some(&alice), Some(body.clone())).await?;
        assert!(
            status == StatusCode::BAD_REQUEST
                || status == StatusCode::UNPROCESSABLE_ENTITY
                || status == StatusCode::FORBIDDEN,
            "{body} gave {status}"
        );
    }
    assert!(
        mailer
            .sent()
            .iter()
            .all(|message| message.to != "bob@example.com")
    );

    let (status, _) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({ "email": "alice@example.com", "role": "reader" })),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::CONFLICT,
        "the owner is already a member"
    );

    invite(
        &app,
        &mailer,
        &alice,
        &workspace_id,
        "bob@example.com",
        "reader",
    )
    .await?;
    invite(
        &app,
        &mailer,
        &alice,
        &workspace_id,
        "bob@example.com",
        "writer",
    )
    .await?;
    let (_, overview) = call(
        &app,
        "GET",
        &format!("/api/workspaces/{workspace_id}/members"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(
        overview["invitations"].as_array().map(Vec::len),
        Some(1),
        "re-inviting renews"
    );
    assert_eq!(overview["invitations"][0]["role"], "writer");

    let (status, _) = call(
        &app,
        "POST",
        &uri,
        Some(&stranger),
        Some(json!({ "email": "x@example.com", "role": "reader" })),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "strangers cannot even see the workspace"
    );
    let (status, _) = call(
        &app,
        "GET",
        &format!("/api/workspaces/{workspace_id}/members"),
        Some(&stranger),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NOT_FOUND);

    Ok(())
}

#[tokio::test]
async fn roles_can_be_changed_and_members_removed_within_the_hierarchy() -> anyhow::Result<()> {
    let (app, pool, _container, mailer) = spawn_app_with_mailer().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let bob = signed_in_cookie(&app, &pool, "bob@example.com", "bob").await?;
    let carol = signed_in_cookie(&app, &pool, "carol@example.com", "carol").await?;
    let (workspace_id, board_id, _) = create_workspace_board_list(&app, &alice).await?;

    for (cookie, email, role) in [
        (&bob, "bob@example.com", "writer"),
        (&carol, "carol@example.com", "writer"),
    ] {
        let id = invite(&app, &mailer, &alice, &workspace_id, email, role).await?;
        accept(&app, cookie, &id).await?;
    }

    let (_, overview) = call(
        &app,
        "GET",
        &format!("/api/workspaces/{workspace_id}/members"),
        Some(&bob),
        None,
    )
    .await?;
    assert_eq!(overview["role"], "writer");
    assert_eq!(overview["members"].as_array().map(Vec::len), Some(3));
    assert_eq!(
        overview["members"][0]["role"], "owner",
        "owner is listed first"
    );
    assert_eq!(
        overview["invitations"],
        json!([]),
        "writers do not see invitations"
    );
    let owner_id = overview["members"][0]["user_id"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    let bob_id = overview["members"]
        .as_array()
        .and_then(|m| m.iter().find(|x| x["username"] == "bob"))
        .map(|x| x["user_id"].as_str().unwrap_or_default().to_string())
        .unwrap_or_default();
    let carol_id = overview["members"]
        .as_array()
        .and_then(|m| m.iter().find(|x| x["username"] == "carol"))
        .map(|x| x["user_id"].as_str().unwrap_or_default().to_string())
        .unwrap_or_default();

    let member_uri = |id: &str| format!("/api/workspaces/{workspace_id}/members/{id}");

    let (status, _) = call(
        &app,
        "PATCH",
        &member_uri(&carol_id),
        Some(&bob),
        Some(json!({ "role": "reader" })),
    )
    .await?;
    assert_eq!(status, StatusCode::FORBIDDEN, "writers cannot change roles");

    let (status, changed) = call(
        &app,
        "PATCH",
        &member_uri(&bob_id),
        Some(&alice),
        Some(json!({ "role": "admin" })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(changed["role"], "admin");

    let (status, _) = call(
        &app,
        "PATCH",
        &member_uri(&carol_id),
        Some(&bob),
        Some(json!({ "role": "admin" })),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "an admin cannot create another admin"
    );
    let (status, _) = call(
        &app,
        "PATCH",
        &member_uri(&owner_id),
        Some(&bob),
        Some(json!({ "role": "reader" })),
    )
    .await?;
    assert_eq!(status, StatusCode::FORBIDDEN, "nobody demotes the owner");
    let (status, _) = call(
        &app,
        "PATCH",
        &member_uri(&bob_id),
        Some(&alice),
        Some(json!({ "role": "owner" })),
    )
    .await?;
    assert_eq!(
        status,
        StatusCode::FORBIDDEN,
        "the owner role is never assigned"
    );
    let (status, _) = call(&app, "DELETE", &member_uri(&owner_id), Some(&bob), None).await?;
    assert_eq!(status, StatusCode::FORBIDDEN, "nobody removes the owner");

    let (status, _) = call(
        &app,
        "PATCH",
        &member_uri(&carol_id),
        Some(&bob),
        Some(json!({ "role": "reader" })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK, "an admin demotes a writer");

    let (status, _) = call(&app, "DELETE", &member_uri(&carol_id), Some(&bob), None).await?;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _) = call(
        &app,
        "GET",
        &format!("/api/boards/{board_id}"),
        Some(&carol),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NOT_FOUND, "removal cuts access at once");
    let (_, workspaces) = call(&app, "GET", "/api/workspaces", Some(&carol), None).await?;
    assert_eq!(workspaces, json!([]));

    let (status, body) = call(&app, "DELETE", &member_uri(&owner_id), Some(&alice), None).await?;
    assert_eq!(
        status,
        StatusCode::CONFLICT,
        "the owner cannot leave: {body}"
    );

    let (status, _) = call(&app, "DELETE", &member_uri(&bob_id), Some(&bob), None).await?;
    assert_eq!(status, StatusCode::NO_CONTENT, "a member can leave");
    let (status, _) = call(
        &app,
        "GET",
        &format!("/api/boards/{board_id}"),
        Some(&bob),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (_, view) = call(
        &app,
        "GET",
        &format!("/api/boards/{board_id}"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(view["role"], "owner");

    Ok(())
}

#[tokio::test]
async fn deleting_the_workspace_removes_members_and_invitations() -> anyhow::Result<()> {
    let (app, pool, _container, mailer) = spawn_app_with_mailer().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let bob = signed_in_cookie(&app, &pool, "bob@example.com", "bob").await?;
    let (workspace_id, _, _) = create_workspace_board_list(&app, &alice).await?;
    let id = invite(
        &app,
        &mailer,
        &alice,
        &workspace_id,
        "bob@example.com",
        "reader",
    )
    .await?;
    accept(&app, &bob, &id).await?;
    invite(
        &app,
        &mailer,
        &alice,
        &workspace_id,
        "later@example.com",
        "reader",
    )
    .await?;

    let (status, _) = call(
        &app,
        "DELETE",
        &format!("/api/workspaces/{workspace_id}"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);

    let members: i64 = sqlx::query_scalar("SELECT count(*) FROM workspace_members")
        .fetch_one(&pool)
        .await?;
    let invitations: i64 = sqlx::query_scalar("SELECT count(*) FROM workspace_invitations")
        .fetch_one(&pool)
        .await?;
    assert_eq!((members, invitations), (0, 0));

    Ok(())
}

#[tokio::test]
async fn changes_stream_to_the_other_members_in_real_time() -> anyhow::Result<()> {
    let (app, pool, _container, mailer) = spawn_app_with_mailer().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let bob = signed_in_cookie(&app, &pool, "bob@example.com", "bob").await?;
    let outsider = signed_in_cookie(&app, &pool, "eve@example.com", "eve").await?;
    let (workspace_id, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;

    let mut outsider_stream = open_stream(&app, &outsider).await?;
    wait_for_event(&mut outsider_stream, "event: ready").await?;

    // Bob streams before he belongs: the invitation reaches him, then access starts.
    let mut bob_stream = open_stream(&app, &bob).await?;
    wait_for_event(&mut bob_stream, "event: ready").await?;

    let id = invite(
        &app,
        &mailer,
        &alice,
        &workspace_id,
        "bob@example.com",
        "writer",
    )
    .await?;
    wait_for_event(&mut bob_stream, "event: invitations").await?;
    accept(&app, &bob, &id).await?;
    wait_for_event(&mut bob_stream, "event: members").await?;

    let (status, _) = call(
        &app,
        "POST",
        &format!("/api/lists/{list_id}/cards"),
        Some(&alice),
        Some(json!({ "title": "Live" })),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED);
    let seen = wait_for_event(&mut bob_stream, "event: board").await?;
    assert!(seen.contains(&board_id), "event names the board: {seen}");
    assert!(seen.contains(&workspace_id));

    // Removal reaches Bob, and nothing after it does.
    let (_, overview) = call(
        &app,
        "GET",
        &format!("/api/workspaces/{workspace_id}/members"),
        Some(&alice),
        None,
    )
    .await?;
    let bob_id = overview["members"]
        .as_array()
        .and_then(|members| members.iter().find(|member| member["username"] == "bob"))
        .and_then(|member| member["user_id"].as_str())
        .unwrap_or_default()
        .to_string();
    let (status, _) = call(
        &app,
        "DELETE",
        &format!("/api/workspaces/{workspace_id}/members/{bob_id}"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);
    wait_for_event(&mut bob_stream, "event: members").await?;

    let (status, _) = call(
        &app,
        "PATCH",
        &format!("/api/boards/{board_id}"),
        Some(&alice),
        Some(json!({ "name": "After" })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK);
    let late = wait_for_event(&mut bob_stream, "event: board").await;
    assert!(
        late.is_err(),
        "a removed member must not hear about the board"
    );

    let leaked = wait_for_event(&mut outsider_stream, "event: board").await;
    assert!(
        leaked.is_err(),
        "an outsider must never hear about a workspace"
    );

    Ok(())
}

#[tokio::test]
async fn the_event_stream_requires_a_session() -> anyhow::Result<()> {
    let (app, _pool, _container) = spawn_app().await?;

    let (status, _) = call(&app, "GET", "/api/events", None, None).await?;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
    Ok(())
}
