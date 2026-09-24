use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::Json;
use axum::extract::{ConnectInfo, Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use crate::dto::ErrorResponseDto;

pub struct RateLimiter {
    max_requests: u32,
    window: Duration,
    hits: Mutex<HashMap<IpAddr, (u32, Instant)>>,
}

impl RateLimiter {
    pub fn new(max_requests: u32, window: Duration) -> Self {
        Self {
            max_requests,
            window,
            hits: Mutex::new(HashMap::new()),
        }
    }

    fn allow(&self, ip: IpAddr) -> bool {
        let mut hits = self
            .hits
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let now = Instant::now();
        let entry = hits.entry(ip).or_insert((0, now));

        if now.duration_since(entry.1) > self.window {
            *entry = (0, now);
        }

        entry.0 += 1;
        entry.0 <= self.max_requests
    }
}

pub async fn rate_limit(
    State(limiter): State<std::sync::Arc<RateLimiter>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    request: Request,
    next: Next,
) -> Response {
    if limiter.allow(addr.ip()) {
        next.run(request).await
    } else {
        (
            StatusCode::TOO_MANY_REQUESTS,
            Json(ErrorResponseDto {
                message: "too many requests".to_string(),
            }),
        )
            .into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_requests_under_the_limit_and_blocks_over_it() {
        let limiter = RateLimiter::new(2, Duration::from_secs(60));
        let ip: IpAddr = "127.0.0.1"
            .parse()
            .unwrap_or_else(|_| IpAddr::from([127, 0, 0, 1]));

        assert!(limiter.allow(ip));
        assert!(limiter.allow(ip));
        assert!(!limiter.allow(ip));
    }
}
