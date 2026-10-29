use application::{CalendarFeedError, GetCalendarFeed};
use axum::extract::{Path, State};
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};

use crate::ics::{build_feed, dtstamp_now};
use crate::state::AppState;

#[utoipa::path(
    get,
    path = "/calendar/{token}",
    tag = "calendar",
    summary = "Someone's calendar feed of their assigned cards",
    description = "No session needed: the token in the address is the only credential, the same as a Google Calendar \"secret address\". A trailing `.ics` is accepted and stripped, so the conventional `/calendar/{token}.ics` address also works. It answers a plain 404 for a token nobody holds, says nothing more, and is never cached by a shared cache. Cards with no due date are left out, since an all-day event needs a day to sit on.",
    params(("token" = String, Path, description = "A calendar token, with or without its .ics suffix")),
    responses(
        (status = 200, description = "The feed", content_type = "text/calendar"),
        (status = 404, description = "No account holds this token"),
    )
)]
pub async fn get_calendar_feed(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Response {
    let token = token.strip_suffix(".ics").unwrap_or(&token);

    let use_case = GetCalendarFeed::new(state.user_repo.clone(), state.card_repo.clone());
    let found = match use_case.execute(token).await {
        Ok(found) => found,
        Err(CalendarFeedError::Repository(message)) => {
            eprintln!("calendar feed failed: {message}");
            return StatusCode::INTERNAL_SERVER_ERROR.into_response();
        }
    };

    let Some((user, cards)) = found else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let body = build_feed(&user.username, &cards, &dtstamp_now(), &state.app_base_url);

    let mut response = (StatusCode::OK, body).into_response();
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/calendar; charset=utf-8"),
    );
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("inline; filename=\"lekthik.ics\""),
    );
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-store"),
    );
    response
}
