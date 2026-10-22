use application::CreateLabel;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{CreateLabelRequestDto, ErrorResponseDto, LabelDto};
use crate::state::AppState;

#[utoipa::path(
    post,
    path = "/boards/{id}/labels",
    tag = "labels",
    summary = "Create a label",
    description = "Creates a label with a name, a color from the fixed palette and a priority (none, low, medium, high, urgent). A board holds up to 30 labels.",
    params(("id" = Uuid, Path, description = "Board id")),
    request_body = CreateLabelRequestDto,
    responses(
        (status = 201, body = LabelDto),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
        (status = 409, description = "Label limit reached", body = ErrorResponseDto),
    )
)]
pub async fn create_label(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(board_id): Path<Uuid>,
    Json(payload): Json<CreateLabelRequestDto>,
) -> Response {
    let use_case = CreateLabel::new(state.label_repo.clone());

    match use_case
        .execute(
            user_id,
            board_id,
            &payload.name,
            &payload.color,
            &payload.priority,
        )
        .await
    {
        Ok(label) => (StatusCode::CREATED, Json(LabelDto::from(label))).into_response(),
        Err(error) => boards_error_response(error),
    }
}
