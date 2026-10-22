use axum::http::{HeaderValue, header};
use tower_http::set_header::SetResponseHeaderLayer;
use utoipa_axum::router::OpenApiRouter;

use crate::state::AppState;

const API_CONTENT_SECURITY_POLICY: &str = "default-src 'none'; frame-ancestors 'none'";

pub fn with_api_security_headers(router: OpenApiRouter<AppState>) -> OpenApiRouter<AppState> {
    router
        .layer(SetResponseHeaderLayer::overriding(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::REFERRER_POLICY,
            HeaderValue::from_static("no-referrer"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::CONTENT_SECURITY_POLICY,
            HeaderValue::from_static(API_CONTENT_SECURITY_POLICY),
        ))
}
