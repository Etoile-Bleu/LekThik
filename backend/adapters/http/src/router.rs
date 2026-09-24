use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::http::{HeaderValue, Method, header};
use axum::middleware;
use tower_http::cors::CorsLayer;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;
use utoipa_swagger_ui::SwaggerUi;

use crate::handlers::*;
use crate::rate_limit::{RateLimiter, rate_limit};
use crate::state::AppState;

#[derive(OpenApi)]
#[openapi(
    info(title = "LekThik API", description = "Boards, lists, cards and account management"),
    tags(
        (name = "users", description = "Email/password registration and profile"),
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
        .routes(routes!(login_user))
        .routes(routes!(logout))
        .routes(routes!(get_current_user))
        .layer(middleware::from_fn_with_state(rate_limiter, rate_limit));

    let (router, api) = OpenApiRouter::<AppState>::with_openapi(ApiDoc::openapi())
        .nest("/api", auth_router)
        .with_state(state)
        .split_for_parts();

    router
        .merge(SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", api))
        .layer(cors_layer())
}

const DEFAULT_CORS_ALLOWED_ORIGIN: &str = "http://localhost:5173";

fn cors_layer() -> CorsLayer {
    let allowed_origins = std::env::var("CORS_ALLOWED_ORIGINS")
        .unwrap_or_else(|_| DEFAULT_CORS_ALLOWED_ORIGIN.to_string());

    let origins: Vec<HeaderValue> = allowed_origins
        .split(',')
        .map(str::trim)
        .filter(|origin| !origin.is_empty())
        .filter_map(|origin| origin.parse().ok())
        .collect();

    // The session cookie only reaches the browser's fetch calls when the
    // response names the exact origin, methods and headers, and explicitly
    // allows credentials; none of these can be `Any` once credentials are
    // allowed, per the fetch spec, hence the explicit lists below. An empty
    // or unparseable origin list intentionally denies every origin rather
    // than falling back to a wildcard.
    CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::DELETE])
        .allow_headers([header::CONTENT_TYPE])
        .allow_credentials(true)
}
