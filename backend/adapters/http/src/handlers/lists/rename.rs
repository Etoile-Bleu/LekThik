use application::RenameList;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{ErrorResponseDto, ListResponseDto, NameRequestDto};
use crate::state::AppState;

#[utoipa::path(
    patch,
    path = "/lists/{id}",
    tag = "lists",
    summary = "Rename a list",
    params(("id" = Uuid, Path, description = "List id")),
    request_body = NameRequestDto,
    responses(
        (status = 200, body = ListResponseDto),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn rename_list(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<NameRequestDto>,
) -> Response {
    let use_case = RenameList::new(state.list_repo.clone());

    match use_case.execute(user_id, id, &payload.name).await {
        Ok(list) => (StatusCode::OK, Json(ListResponseDto::from(list))).into_response(),
        Err(error) => boards_error_response(error),
    }
}
