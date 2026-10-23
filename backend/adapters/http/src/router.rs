use std::sync::Arc;
use std::time::Duration;

use axum::Router;
use axum::extract::DefaultBodyLimit;
use axum::http::{HeaderName, HeaderValue, Method, header};
use axum::middleware;
use tower_http::cors::CorsLayer;
use utoipa::OpenApi;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;
use utoipa_swagger_ui::SwaggerUi;

use crate::events::*;
use crate::handlers::*;
use crate::notify::notify_changes;
use crate::rate_limit::{RateLimiter, rate_limit};
use crate::security_headers::with_api_security_headers;
use crate::state::AppState;

#[derive(OpenApi)]
#[openapi(
    info(title = "LekThik API", description = "Boards, lists, cards and account management"),
    tags(
        (name = "users", description = "Email/password registration and profile"),
        (name = "auth", description = "Login, logout, email verification and password reset"),
        (name = "workspaces", description = "Workspaces owned by the signed in user"),
        (name = "boards", description = "Boards inside a workspace"),
        (name = "lists", description = "Lists inside a board"),
        (name = "cards", description = "Cards inside a list"),
        (name = "labels", description = "Colored priority labels of a board"),
        (name = "members", description = "Members of a workspace and their roles"),
        (name = "invitations", description = "Email invitations to join a workspace"),
        (name = "events", description = "Live change notifications"),
        (name = "templates", description = "Ready made workspaces and boards to start from"),
    )
)]
struct ApiDoc;

const AUTH_RATE_LIMIT_MAX_REQUESTS: u32 = 10;
const AUTH_RATE_LIMIT_WINDOW_SECONDS: u64 = 60;
const BOARDS_RATE_LIMIT_MAX_REQUESTS: u32 = 600;
const BOARDS_RATE_LIMIT_WINDOW_SECONDS: u64 = 60;
const BOARDS_BODY_LIMIT_BYTES: usize = 64 * 1024;

const MEDIA_RATE_LIMIT_MAX_REQUESTS: u32 = 120;
const MEDIA_RATE_LIMIT_WINDOW_SECONDS: u64 = 60;
/// A little above the largest picture, for the request around it.
const MEDIA_BODY_LIMIT_BYTES: usize = domain::boards::IMAGE_MAX_UPLOAD_BYTES + 16 * 1024;

/// Pictures travel on their own routes, with a larger body limit than the rest of the API.
fn media_router() -> OpenApiRouter<AppState> {
    let rate_limiter = Arc::new(RateLimiter::new(
        MEDIA_RATE_LIMIT_MAX_REQUESTS,
        Duration::from_secs(MEDIA_RATE_LIMIT_WINDOW_SECONDS),
    ));

    OpenApiRouter::<AppState>::new()
        .routes(routes!(set_block_image, get_block_image))
        .layer(DefaultBodyLimit::max(MEDIA_BODY_LIMIT_BYTES))
        .layer(middleware::from_fn_with_state(rate_limiter, rate_limit))
}

fn boards_router(state: AppState) -> OpenApiRouter<AppState> {
    let rate_limiter = Arc::new(RateLimiter::new(
        BOARDS_RATE_LIMIT_MAX_REQUESTS,
        Duration::from_secs(BOARDS_RATE_LIMIT_WINDOW_SECONDS),
    ));

    OpenApiRouter::<AppState>::new()
        .routes(routes!(list_templates))
        .routes(routes!(get_current_user))
        .routes(routes!(get_preferences, save_preferences))
        .routes(routes!(list_my_cards))
        .routes(routes!(logout))
        .routes(routes!(list_workspaces, create_workspace))
        .routes(routes!(rename_workspace, delete_workspace))
        .routes(routes!(create_board))
        .routes(routes!(get_board, rename_board, delete_board))
        .routes(routes!(set_board_look))
        .routes(routes!(set_board_layout))
        .routes(routes!(create_list))
        .routes(routes!(create_label))
        .routes(routes!(rename_list, delete_list))
        .routes(routes!(set_list_wip_limit))
        .routes(routes!(create_block))
        .routes(routes!(set_block_config))
        .routes(routes!(move_list))
        .routes(routes!(create_card))
        .routes(routes!(duplicate_card))
        .routes(routes!(duplicate_panel))
        .routes(routes!(get_card, update_card, delete_card))
        .routes(routes!(move_card))
        .routes(routes!(set_card_labels))
        .routes(routes!(set_card_assignees))
        .routes(routes!(update_label, delete_label))
        .routes(routes!(list_members))
        .routes(routes!(change_member_role, remove_member))
        .routes(routes!(invite_member))
        .routes(routes!(revoke_invitation))
        .routes(routes!(list_my_invitations))
        .routes(routes!(get_my_invitation))
        .routes(routes!(accept_invitation))
        .routes(routes!(decline_invitation))
        .routes(routes!(stream_events))
        .layer(middleware::from_fn_with_state(state, notify_changes))
        .layer(DefaultBodyLimit::max(BOARDS_BODY_LIMIT_BYTES))
        .layer(middleware::from_fn_with_state(rate_limiter, rate_limit))
}

pub fn build(state: AppState) -> Router {
    let rate_limiter = Arc::new(RateLimiter::new(
        AUTH_RATE_LIMIT_MAX_REQUESTS,
        Duration::from_secs(AUTH_RATE_LIMIT_WINDOW_SECONDS),
    ));

    let auth_router = OpenApiRouter::<AppState>::new()
        .routes(routes!(register_user))
        .routes(routes!(login_user))
        .routes(routes!(verify_email))
        .routes(routes!(resend_verification))
        .routes(routes!(forgot_password))
        .routes(routes!(reset_password))
        .layer(middleware::from_fn_with_state(rate_limiter, rate_limit));

    let api_router = with_api_security_headers(
        auth_router
            .merge(boards_router(state.clone()))
            .merge(media_router()),
    );

    let (router, api) = OpenApiRouter::<AppState>::with_openapi(ApiDoc::openapi())
        .nest("/api", api_router)
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
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
        ])
        .allow_headers([header::CONTENT_TYPE, HeaderName::from_static("x-client-id")])
        .allow_credentials(true)
}
