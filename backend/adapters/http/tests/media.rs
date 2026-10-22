mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use common::{
    board_view, call, create_workspace_board_list, id_of, signed_in_cookie, spawn_app,
    with_connect_info,
};
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::PngEncoder;
use image::{DynamicImage, ImageBuffer, Rgb, Rgba};
use serde_json::json;
use sqlx::PgPool;
use tower::ServiceExt;

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

fn jpeg(width: u32, height: u32) -> Vec<u8> {
    let buffer = ImageBuffer::from_fn(width, height, |x, y| {
        Rgb([(x * 3) as u8, (y * 5) as u8, 80])
    });
    let mut bytes = Vec::new();
    // A failed encode leaves the bytes empty, which the tests that use them would show at once.
    DynamicImage::ImageRgb8(buffer)
        .write_with_encoder(JpegEncoder::new_with_quality(&mut bytes, 90))
        .ok();
    bytes
}

fn png(width: u32, height: u32) -> Vec<u8> {
    let buffer = ImageBuffer::from_fn(width, height, |x, _| Rgba([10, 120, 200, (x * 8) as u8]));
    let mut bytes = Vec::new();
    DynamicImage::ImageRgba8(buffer)
        .write_with_encoder(PngEncoder::new(&mut bytes))
        .ok();
    bytes
}

/// A JPEG that carries a position and a camera name in an EXIF block.
fn jpeg_with_secrets() -> Vec<u8> {
    let plain = jpeg(40, 30);
    let payload = b"Exif\0\0MM\0*\0\0\0\x08\0\0\0\0\0\0GPSLatitude=48.8566;Make=SecretCam";
    let mut segment: Vec<u8> = vec![0xFF, 0xE1];
    segment.extend_from_slice(&((payload.len() + 2) as u16).to_be_bytes());
    segment.extend_from_slice(payload);
    let mut bytes = plain[..2].to_vec();
    bytes.extend_from_slice(&segment);
    bytes.extend_from_slice(&plain[2..]);
    bytes
}

async fn upload(
    app: &axum::Router,
    cookie: Option<&str>,
    block_id: &str,
    bytes: Vec<u8>,
) -> anyhow::Result<(StatusCode, serde_json::Value)> {
    let mut builder = Request::builder()
        .method("PUT")
        .uri(format!("/api/blocks/{block_id}/image"))
        .header(header::CONTENT_TYPE, "application/octet-stream");
    if let Some(cookie) = cookie {
        builder = builder.header(header::COOKIE, cookie);
    }
    let response = app
        .clone()
        .oneshot(with_connect_info(builder.body(Body::from(bytes))?))
        .await?;
    let status = response.status();
    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await?;
    let value = serde_json::from_slice(&body).unwrap_or(serde_json::Value::Null);
    Ok((status, value))
}

async fn download(
    app: &axum::Router,
    cookie: Option<&str>,
    block_id: &str,
) -> anyhow::Result<(StatusCode, axum::http::HeaderMap, Vec<u8>)> {
    let mut builder = Request::builder()
        .method("GET")
        .uri(format!("/api/blocks/{block_id}/image"));
    if let Some(cookie) = cookie {
        builder = builder.header(header::COOKIE, cookie);
    }
    let response = app
        .clone()
        .oneshot(with_connect_info(builder.body(Body::empty())?))
        .await?;
    let status = response.status();
    let headers = response.headers().clone();
    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await?;
    Ok((status, headers, body.to_vec()))
}

async fn image_block(app: &axum::Router, cookie: &str, board_id: &str) -> anyhow::Result<String> {
    let (status, block) = call(
        app,
        "POST",
        &format!("/api/boards/{board_id}/blocks"),
        Some(cookie),
        Some(json!({ "kind": "image", "name": "Moodboard",
            "config": { "alt": "Three colour swatches" } })),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED, "{block}");
    id_of(&block)
}

fn contains(haystack: &[u8], needle: &[u8]) -> bool {
    haystack
        .windows(needle.len())
        .any(|window| window == needle)
}

#[tokio::test]
async fn a_picture_is_cleaned_kept_and_served_to_members_only() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let rita = signed_in_cookie(&app, &pool, "rita@example.com", "rita").await?;
    let eve = signed_in_cookie(&app, &pool, "eve@example.com", "eve").await?;
    let (workspace_id, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    join_as(&pool, &workspace_id, "rita@example.com", "reader").await?;
    let block_id = image_block(&app, &alice, &board_id).await?;

    let view = board_view(&app, &alice, &board_id).await?;
    assert_eq!(
        view["lists"][1]["image_version"],
        json!(null),
        "no picture yet"
    );

    let (status, saved) = upload(&app, Some(&alice), &block_id, jpeg_with_secrets()).await?;
    assert_eq!(status, StatusCode::OK, "{saved}");
    let version = saved["image_version"].as_i64().expect("a version");

    let view = board_view(&app, &alice, &board_id).await?;
    assert_eq!(view["lists"][1]["image_version"], version);

    let (status, headers, body) = download(&app, Some(&alice), &block_id).await?;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(headers[header::CONTENT_TYPE], "image/jpeg");
    assert_eq!(headers[header::X_CONTENT_TYPE_OPTIONS], "nosniff");
    assert_eq!(headers[header::CACHE_CONTROL], "no-store");
    for secret in [&b"GPSLatitude"[..], b"SecretCam", b"Exif"] {
        assert!(
            !contains(&body, secret),
            "{} must not be kept",
            String::from_utf8_lossy(secret)
        );
    }
    assert_eq!(&body[..2], &[0xFF, 0xD8]);

    let (status, _, _) = download(&app, Some(&rita), &block_id).await?;
    assert_eq!(status, StatusCode::OK, "readers can see it");
    let (status, _, _) = download(&app, Some(&eve), &block_id).await?;
    assert_eq!(status, StatusCode::NOT_FOUND, "outsiders learn nothing");
    let (status, _, _) = download(&app, None, &block_id).await?;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    Ok(())
}

#[tokio::test]
async fn a_new_picture_replaces_the_old_one_with_a_new_version() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    let block_id = image_block(&app, &alice, &board_id).await?;

    let (_, first) = upload(&app, Some(&alice), &block_id, jpeg(30, 30)).await?;
    let (_, second) = upload(&app, Some(&alice), &block_id, png(20, 20)).await?;

    assert_ne!(first["image_version"], second["image_version"]);
    let (_, headers, body) = download(&app, Some(&alice), &block_id).await?;
    assert_eq!(
        headers[header::CONTENT_TYPE],
        "image/png",
        "transparency keeps a PNG"
    );
    assert_eq!(&body[..4], &[0x89, b'P', b'N', b'G']);
    let rows: i64 = sqlx::query_scalar("SELECT count(*) FROM block_images")
        .fetch_one(&pool)
        .await?;
    assert_eq!(rows, 1, "one picture per block");

    Ok(())
}

#[tokio::test]
async fn only_real_pictures_are_accepted_whatever_they_are_called() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    let block_id = image_block(&app, &alice, &board_id).await?;

    for (name, bytes) in [
        (
            "svg",
            b"<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>".to_vec(),
        ),
        ("html", b"<html><script>alert(1)</script></html>".to_vec()),
        ("text", b"hello".to_vec()),
        ("empty", Vec::new()),
        ("fake jpeg", vec![0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3]),
    ] {
        let (status, _) = upload(&app, Some(&alice), &block_id, bytes).await?;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{name}");
    }

    let rows: i64 = sqlx::query_scalar("SELECT count(*) FROM block_images")
        .fetch_one(&pool)
        .await?;
    assert_eq!(rows, 0, "nothing was kept");

    Ok(())
}

#[tokio::test]
async fn a_file_over_five_megabytes_is_refused() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    let block_id = image_block(&app, &alice, &board_id).await?;

    let (status, _) = upload(&app, Some(&alice), &block_id, vec![0; 6 * 1024 * 1024]).await?;

    assert!(
        status == StatusCode::PAYLOAD_TOO_LARGE || status == StatusCode::BAD_REQUEST,
        "{status}"
    );
    Ok(())
}

#[tokio::test]
async fn only_writers_can_upload_and_only_to_image_blocks() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let wen = signed_in_cookie(&app, &pool, "wen@example.com", "wen").await?;
    let rita = signed_in_cookie(&app, &pool, "rita@example.com", "rita").await?;
    let eve = signed_in_cookie(&app, &pool, "eve@example.com", "eve").await?;
    let (workspace_id, board_id, list_id) = create_workspace_board_list(&app, &alice).await?;
    join_as(&pool, &workspace_id, "wen@example.com", "writer").await?;
    join_as(&pool, &workspace_id, "rita@example.com", "reader").await?;
    let block_id = image_block(&app, &alice, &board_id).await?;
    let (_, note) = call(
        &app,
        "POST",
        &format!("/api/boards/{board_id}/blocks"),
        Some(&alice),
        Some(json!({ "kind": "note", "name": "Rules" })),
    )
    .await?;

    let (status, _) = upload(&app, Some(&wen), &block_id, jpeg(20, 20)).await?;
    assert_eq!(status, StatusCode::OK, "writers can");
    let (status, _) = upload(&app, Some(&rita), &block_id, jpeg(20, 20)).await?;
    assert_eq!(status, StatusCode::FORBIDDEN, "readers cannot");
    let (status, _) = upload(&app, Some(&eve), &block_id, jpeg(20, 20)).await?;
    assert_eq!(status, StatusCode::NOT_FOUND, "outsiders learn nothing");
    let (status, _) = upload(&app, None, &block_id, jpeg(20, 20)).await?;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    let (status, _) = upload(&app, Some(&alice), &id_of(&note)?, jpeg(20, 20)).await?;
    assert_eq!(status, StatusCode::BAD_REQUEST, "a note holds no picture");
    let (status, _) = upload(&app, Some(&alice), &list_id, jpeg(20, 20)).await?;
    assert_eq!(status, StatusCode::BAD_REQUEST, "a list holds no picture");

    Ok(())
}

#[tokio::test]
async fn a_picture_goes_with_its_block_its_board_and_its_workspace() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (workspace_id, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    let count = || async {
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM block_images")
            .fetch_one(&pool)
            .await
    };

    let first = image_block(&app, &alice, &board_id).await?;
    upload(&app, Some(&alice), &first, jpeg(20, 20)).await?;
    assert_eq!(count().await?, 1);
    let (status, _) = call(
        &app,
        "DELETE",
        &format!("/api/lists/{first}"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(count().await?, 0, "deleting the block deletes the picture");

    let second = image_block(&app, &alice, &board_id).await?;
    upload(&app, Some(&alice), &second, jpeg(20, 20)).await?;
    let (status, _) = call(
        &app,
        "DELETE",
        &format!("/api/boards/{board_id}"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(count().await?, 0, "deleting the board deletes the picture");

    let (_, other_board) = call(
        &app,
        "POST",
        &format!("/api/workspaces/{workspace_id}/boards"),
        Some(&alice),
        Some(json!({ "name": "Another" })),
    )
    .await?;
    let third = image_block(&app, &alice, &id_of(&other_board)?).await?;
    upload(&app, Some(&alice), &third, jpeg(20, 20)).await?;
    let (status, _) = call(
        &app,
        "DELETE",
        &format!("/api/workspaces/{workspace_id}"),
        Some(&alice),
        None,
    )
    .await?;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(
        count().await?,
        0,
        "deleting the workspace deletes the picture"
    );

    Ok(())
}

#[tokio::test]
async fn an_image_block_needs_a_description() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    let uri = format!("/api/boards/{board_id}/blocks");

    for bad in [
        json!({ "kind": "image", "name": "Pic" }),
        json!({ "kind": "image", "name": "Pic", "config": { "alt": "  " } }),
        json!({ "kind": "image", "name": "Pic", "config": { "alt": "x".repeat(301) } }),
        json!({ "kind": "image", "name": "Pic", "config": { "alt": "ok", "src": "http://x" } }),
    ] {
        let (status, _) = call(&app, "POST", &uri, Some(&alice), Some(bad.clone())).await?;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{bad}");
    }

    Ok(())
}

#[tokio::test]
async fn embeds_keep_an_identifier_and_only_for_the_known_providers() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    let uri = format!("/api/boards/{board_id}/blocks");

    let (status, embed) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({ "kind": "embed", "name": "Teaser",
            "config": { "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=9", "title": "Launch teaser" } })),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED, "{embed}");
    assert_eq!(
        embed["config"],
        json!({ "size": "normal", "provider": "youtube", "id": "dQw4w9WgXcQ", "title": "Launch teaser" }),
        "only the identifier is stored, not the address"
    );

    let (status, again) = call(
        &app,
        "PUT",
        &format!("/api/blocks/{}/config", id_of(&embed)?),
        Some(&alice),
        Some(json!({ "kind": "embed", "config": embed["config"] })),
    )
    .await?;
    assert_eq!(status, StatusCode::OK, "{again}");

    for bad in [
        json!({ "url": "https://evil.example/watch?v=dQw4w9WgXcQ", "title": "T" }),
        json!({ "url": "http://www.youtube.com/watch?v=dQw4w9WgXcQ", "title": "T" }),
        json!({ "url": "javascript:alert(1)", "title": "T" }),
        json!({ "url": "https://youtu.be/dQw4w9WgXcQ" }),
        json!({ "provider": "youtube", "id": "x\" onload=\"alert(1)", "title": "T" }),
        json!({ "url": "https://youtu.be/dQw4w9WgXcQ", "title": "T", "autoplay": true }),
    ] {
        let (status, _) = call(
            &app,
            "POST",
            &uri,
            Some(&alice),
            Some(json!({ "kind": "embed", "name": "Bad", "config": bad })),
        )
        .await?;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{bad}");
    }

    let (status, vimeo) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({ "kind": "embed", "name": "Demo",
            "config": { "url": "https://vimeo.com/76979871", "title": "Demo" } })),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(vimeo["config"]["provider"], "vimeo");

    let (status, calendar) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({ "kind": "embed", "name": "Team calendar",
            "config": { "url": "https://calendar.google.com/calendar/embed?src=team%40example.com", "title": "Team calendar" } })),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED, "{calendar}");
    assert_eq!(calendar["config"]["provider"], "google_calendar");

    Ok(())
}

#[tokio::test]
async fn links_are_plain_addresses_and_nothing_is_fetched() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    let uri = format!("/api/boards/{board_id}/blocks");

    let (status, link) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({ "kind": "link", "name": "Docs",
            "config": { "url": "HTTPS://Example.com/docs", "title": "Project docs" } })),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED, "{link}");
    assert_eq!(link["config"]["url"], "https://example.com/docs");

    for bad in [
        json!({ "url": "javascript:alert(1)" }),
        json!({ "url": "data:text/html,hi" }),
        json!({ "url": "ftp://example.com" }),
        json!({ "url": "https://user:secret@example.com" }),
        json!({ "url": "https://exa mple.com" }),
        json!({ "url": "" }),
        json!({ "url": "https://example.com", "preview": true }),
    ] {
        let (status, _) = call(
            &app,
            "POST",
            &uri,
            Some(&alice),
            Some(json!({ "kind": "link", "name": "Bad", "config": bad })),
        )
        .await?;
        assert_eq!(status, StatusCode::BAD_REQUEST, "{bad}");
    }

    Ok(())
}

#[tokio::test]
async fn notes_can_hold_ten_thousand_characters() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let alice = signed_in_cookie(&app, &pool, "alice@example.com", "alice").await?;
    let (_, board_id, _) = create_workspace_board_list(&app, &alice).await?;
    let uri = format!("/api/boards/{board_id}/blocks");

    let (status, note) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(json!({ "kind": "note", "name": "Long", "config": { "text": "é".repeat(10_000) } })),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED, "{note}");

    let (status, _) = call(
        &app,
        "POST",
        &uri,
        Some(&alice),
        Some(
            json!({ "kind": "note", "name": "Too long", "config": { "text": "a".repeat(10_001) } }),
        ),
    )
    .await?;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    Ok(())
}
