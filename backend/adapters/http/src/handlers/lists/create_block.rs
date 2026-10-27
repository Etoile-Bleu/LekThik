use application::CreateBlock;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{CreateBlockRequestDto, ErrorResponseDto, ListResponseDto};
use crate::state::AppState;

#[utoipa::path(
    post,
    path = "/boards/{id}/blocks",
    tag = "lists",
    summary = "Add a block",
    description = "Appends a block (calendar, agenda, note, counter, progress, overdue, chart, snippet, table or clocks) after the existing panels. Blocks share the 50 panel limit with lists, and cards can only go in lists.",
    params(("id" = Uuid, Path, description = "Board id")),
    request_body = CreateBlockRequestDto,
    responses(
        (status = 201, body = ListResponseDto),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 403, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
        (status = 409, description = "Panel limit reached", body = ErrorResponseDto),
    )
)]
pub async fn create_block(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(board_id): Path<Uuid>,
    Json(payload): Json<CreateBlockRequestDto>,
) -> Response {
    let use_case = CreateBlock::new(state.list_repo.clone());

    match use_case
        .execute(
            user_id,
            board_id,
            &payload.kind,
            &payload.name,
            payload.config,
        )
        .await
    {
        Ok(block) => (StatusCode::CREATED, Json(ListResponseDto::from(block))).into_response(),
        Err(error) => boards_error_response(error),
    }
}
