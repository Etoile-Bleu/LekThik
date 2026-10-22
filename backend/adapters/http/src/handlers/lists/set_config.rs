use application::SetBlockConfig;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{ErrorResponseDto, ListResponseDto, SetBlockConfigRequestDto};
use crate::state::AppState;

#[utoipa::path(
    put,
    path = "/blocks/{id}/config",
    tag = "lists",
    summary = "Change the settings of a block",
    description = "Replaces the settings of a block. The kind must match the block and never changes. Rename and delete use the list endpoints.",
    params(("id" = Uuid, Path, description = "Block id")),
    request_body = SetBlockConfigRequestDto,
    responses(
        (status = 200, body = ListResponseDto),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 403, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn set_block_config(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<SetBlockConfigRequestDto>,
) -> Response {
    let use_case = SetBlockConfig::new(state.list_repo.clone());

    match use_case
        .execute(user_id, id, &payload.kind, payload.config)
        .await
    {
        Ok(block) => (StatusCode::OK, Json(ListResponseDto::from(block))).into_response(),
        Err(error) => boards_error_response(error),
    }
}
