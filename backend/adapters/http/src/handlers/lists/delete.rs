use application::DeleteList;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::ErrorResponseDto;
use crate::state::AppState;

#[utoipa::path(
    delete,
    path = "/lists/{id}",
    tag = "lists",
    summary = "Delete a list",
    description = "Deletes the list with all of its cards.",
    params(("id" = Uuid, Path, description = "List id")),
    responses(
        (status = 204, description = "List deleted"),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn delete_list(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let use_case = DeleteList::new(state.list_repo.clone());

    match use_case.execute(user_id, id).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => boards_error_response(error),
    }
}
