use application::CreateList;
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
    post,
    path = "/boards/{id}/lists",
    tag = "lists",
    summary = "Create a list",
    description = "Appends a list to the board. A board holds up to 50 lists.",
    params(("id" = Uuid, Path, description = "Board id")),
    request_body = NameRequestDto,
    responses(
        (status = 201, body = ListResponseDto),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
        (status = 409, description = "List limit reached", body = ErrorResponseDto),
    )
)]
pub async fn create_list(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(board_id): Path<Uuid>,
    Json(payload): Json<NameRequestDto>,
) -> Response {
    let use_case = CreateList::new(state.list_repo.clone());

    match use_case.execute(user_id, board_id, &payload.name).await {
        Ok(list) => (StatusCode::CREATED, Json(ListResponseDto::from(list))).into_response(),
        Err(error) => boards_error_response(error),
    }
}
