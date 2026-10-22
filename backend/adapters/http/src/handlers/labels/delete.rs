use application::DeleteLabel;
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
    path = "/labels/{id}",
    tag = "labels",
    summary = "Delete a label",
    description = "Deletes the label and removes it from every card that carried it.",
    params(("id" = Uuid, Path, description = "Label id")),
    responses(
        (status = 204, description = "Label deleted"),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn delete_label(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let use_case = DeleteLabel::new(state.label_repo.clone());

    match use_case.execute(user_id, id).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => boards_error_response(error),
    }
}
