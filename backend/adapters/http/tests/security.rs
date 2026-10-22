mod common;

use axum::http::{StatusCode, header};
use serde_json::json;
use tower::ServiceExt;

use common::{call, signed_in_cookie, spawn_app, with_connect_info};

#[tokio::test]
async fn api_responses_carry_hardening_headers() -> anyhow::Result<()> {
    let (app, _pool, _container) = spawn_app().await?;

    let request = with_connect_info(
        axum::http::Request::builder()
            .method("GET")
            .uri("/api/workspaces")
            .body(axum::body::Body::empty())?,
    );
    let response = app.oneshot(request).await?;

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    let headers = response.headers();
    assert_eq!(headers[header::X_CONTENT_TYPE_OPTIONS], "nosniff");
    assert_eq!(headers[header::CACHE_CONTROL], "no-store");
    assert_eq!(headers[header::REFERRER_POLICY], "no-referrer");
    assert!(
        headers[header::CONTENT_SECURITY_POLICY]
            .to_str()?
            .contains("default-src 'none'")
    );

    Ok(())
}

#[tokio::test]
async fn oversized_bodies_are_refused() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let cookie = signed_in_cookie(&app, &pool, "owner@example.com", "owner").await?;

    let (status, _) = call(
        &app,
        "POST",
        "/api/workspaces",
        Some(&cookie),
        Some(json!({ "name": "x".repeat(100 * 1024) })),
    )
    .await?;

    assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);

    Ok(())
}

#[tokio::test]
async fn non_json_bodies_and_malformed_ids_are_refused() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let cookie = signed_in_cookie(&app, &pool, "owner@example.com", "owner").await?;

    let form_post = with_connect_info(
        axum::http::Request::builder()
            .method("POST")
            .uri("/api/workspaces")
            .header(header::COOKIE, &cookie)
            .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
            .body(axum::body::Body::from("name=Team"))?,
    );
    let response = app.clone().oneshot(form_post).await?;
    assert_eq!(response.status(), StatusCode::UNSUPPORTED_MEDIA_TYPE);

    let (status, _) = call(&app, "GET", "/api/boards/not-a-uuid", Some(&cookie), None).await?;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    Ok(())
}

#[tokio::test]
async fn hostile_text_is_stored_as_plain_text() -> anyhow::Result<()> {
    let (app, pool, _container) = spawn_app().await?;
    let cookie = signed_in_cookie(&app, &pool, "owner@example.com", "owner").await?;
    let hostile = "'; DROP TABLE users; --<script>alert(1)</script>";

    let (status, workspace) = call(
        &app,
        "POST",
        "/api/workspaces",
        Some(&cookie),
        Some(json!({ "name": hostile })),
    )
    .await?;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(workspace["name"], hostile);

    let (status, _) = call(&app, "GET", "/api/users/me", Some(&cookie), None).await?;
    assert_eq!(status, StatusCode::OK);

    Ok(())
}

async fn preflight(
    app: &axum::Router,
    origin: &str,
    method: &str,
) -> anyhow::Result<axum::response::Response> {
    let request = with_connect_info(
        axum::http::Request::builder()
            .method("OPTIONS")
            .uri("/api/cards/00000000-0000-0000-0000-000000000000/labels")
            .header(header::ORIGIN, origin)
            .header(header::ACCESS_CONTROL_REQUEST_METHOD, method)
            .header(header::ACCESS_CONTROL_REQUEST_HEADERS, "content-type")
            .body(axum::body::Body::empty())?,
    );

    Ok(app.clone().oneshot(request).await?)
}

#[tokio::test]
async fn cors_preflight_allows_every_method_the_app_uses_from_the_configured_origin()
-> anyhow::Result<()> {
    let (app, _pool, _container) = spawn_app().await?;

    for method in ["GET", "POST", "PUT", "PATCH", "DELETE"] {
        let response = preflight(&app, "http://localhost:5173", method).await?;
        let headers = response.headers();

        assert_eq!(
            headers[header::ACCESS_CONTROL_ALLOW_ORIGIN],
            "http://localhost:5173",
            "{method} must be allowed from the app origin"
        );
        assert_eq!(headers[header::ACCESS_CONTROL_ALLOW_CREDENTIALS], "true");
        let allowed = headers[header::ACCESS_CONTROL_ALLOW_METHODS].to_str()?;
        assert!(allowed.contains(method), "{method} missing from {allowed}");
    }

    Ok(())
}

#[tokio::test]
async fn cors_preflight_never_answers_an_unknown_origin() -> anyhow::Result<()> {
    let (app, _pool, _container) = spawn_app().await?;

    let response = preflight(&app, "https://evil.example", "PUT").await?;

    assert!(
        response
            .headers()
            .get(header::ACCESS_CONTROL_ALLOW_ORIGIN)
            .is_none()
    );

    Ok(())
}
