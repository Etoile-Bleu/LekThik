use application::MoveList;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{ErrorResponseDto, MoveListRequestDto};
use crate::state::AppState;

#[utoipa::path(
    post,
    path = "/lists/{id}/move",
    tag = "lists",
    summary = "Move a list",
    description = "Places the list at a zero based index within its board. An index past the end places it last.",
    params(("id" = Uuid, Path, description = "List id")),
    request_body = MoveListRequestDto,
    responses(
        (status = 204, description = "List moved"),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn move_list(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<MoveListRequestDto>,
) -> Response {
    let use_case = MoveList::new(state.list_repo.clone());

    match use_case.execute(user_id, id, payload.index as usize).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => boards_error_response(error),
    }
}
