use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::http::HeaderValue;
use axum::middleware;
use tower_http::cors::{Any, CorsLayer};
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;
use utoipa_swagger_ui::SwaggerUi;

use crate::rate_limit::{RateLimiter, rate_limit};
use crate::session_handlers::*;
use crate::state::AppState;
use crate::user_handlers::*;

#[derive(OpenApi)]
#[openapi(
    info(title = "LekThik API", description = "Boards, lists, cards and account management"),
    tags(
        (name = "users", description = "Email/password registration and confirmation"),
        (name = "auth", description = "Login, logout and session management"),
    )
)]
struct ApiDoc;

const AUTH_RATE_LIMIT_MAX_REQUESTS: u32 = 10;
const AUTH_RATE_LIMIT_WINDOW_SECONDS: u64 = 60;

pub fn build(state: AppState) -> Router {
    let rate_limiter = Arc::new(RateLimiter::new(
        AUTH_RATE_LIMIT_MAX_REQUESTS,
        Duration::from_secs(AUTH_RATE_LIMIT_WINDOW_SECONDS),
    ));

    let auth_router = OpenApiRouter::<AppState>::new()
        .routes(routes!(register_user))
        .routes(routes!(confirm_user))
        .routes(routes!(login_user))
        .routes(routes!(logout))
        .layer(middleware::from_fn_with_state(rate_limiter, rate_limit));

    let (router, api) = OpenApiRouter::<AppState>::with_openapi(ApiDoc::openapi())
        .nest("/api", auth_router)
        .with_state(state)
        .split_for_parts();

    router
        .merge(SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", api))
        .layer(cors_layer())
}

fn cors_layer() -> CorsLayer {
    let allowed_origins = std::env::var("CORS_ALLOWED_ORIGINS").unwrap_or_default();

    let origins: Vec<HeaderValue> = allowed_origins
        .split(',')
        .map(str::trim)
        .filter(|origin| !origin.is_empty())
        .filter_map(|origin| origin.parse().ok())
        .collect();

    if origins.is_empty() {
        return CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(Any)
            .allow_headers(Any);
    }

    CorsLayer::new()
        .allow_origin(origins)
        .allow_methods(Any)
        .allow_headers(Any)
}
