use application::SetListWipLimit;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{ErrorResponseDto, ListResponseDto, WipLimitRequestDto};
use crate::state::AppState;

#[utoipa::path(
    put,
    path = "/lists/{id}/wip-limit",
    tag = "lists",
    summary = "Set a list's work in progress limit",
    description = "A limit between 1 and 99 makes the list warn when it holds more cards. It never blocks adding or moving cards. Send null to remove the limit.",
    params(("id" = Uuid, Path, description = "List id")),
    request_body = WipLimitRequestDto,
    responses(
        (status = 200, body = ListResponseDto),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 403, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn set_list_wip_limit(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<WipLimitRequestDto>,
) -> Response {
    let use_case = SetListWipLimit::new(state.list_repo.clone());

    match use_case.execute(user_id, id, payload.limit).await {
        Ok(list) => (StatusCode::OK, Json(ListResponseDto::from(list))).into_response(),
        Err(error) => boards_error_response(error),
    }
}
