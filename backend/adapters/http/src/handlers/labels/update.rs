use application::UpdateLabel;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{ErrorResponseDto, LabelDto, UpdateLabelRequestDto};
use crate::state::AppState;

#[utoipa::path(
    patch,
    path = "/labels/{id}",
    tag = "labels",
    summary = "Update a label",
    description = "Changes the name, color and or priority. Fields left out are kept as they are.",
    params(("id" = Uuid, Path, description = "Label id")),
    request_body = UpdateLabelRequestDto,
    responses(
        (status = 200, body = LabelDto),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn update_label(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<UpdateLabelRequestDto>,
) -> Response {
    let use_case = UpdateLabel::new(state.label_repo.clone());

    match use_case
        .execute(
            user_id,
            id,
            payload.name.as_deref(),
            payload.color.as_deref(),
            payload.priority.as_deref(),
        )
        .await
    {
        Ok(label) => (StatusCode::OK, Json(LabelDto::from(label))).into_response(),
        Err(error) => boards_error_response(error),
    }
}
