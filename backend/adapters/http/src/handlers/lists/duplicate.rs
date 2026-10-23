use application::DuplicatePanel;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{ErrorResponseDto, ListResponseDto};
use crate::state::AppState;

#[utoipa::path(
    post,
    path = "/lists/{id}/duplicate",
    tag = "lists",
    summary = "Duplicate a list or a block",
    description = "Copies a list with all of its cards (labels and assignees included), or a block with its settings and picture, right after the original. The name gets \" (copy)\" added. Writers and above can do it, and a board holds up to 50 panels.",
    params(("id" = Uuid, Path, description = "List or block id")),
    responses(
        (status = 201, body = ListResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 403, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
        (status = 409, description = "Panel limit reached", body = ErrorResponseDto),
    )
)]
pub async fn duplicate_panel(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let use_case = DuplicatePanel::new(state.list_repo.clone());

    match use_case.execute(user_id, id).await {
        Ok(list) => (StatusCode::CREATED, Json(ListResponseDto::from(list))).into_response(),
        Err(error) => boards_error_response(error),
    }
}
