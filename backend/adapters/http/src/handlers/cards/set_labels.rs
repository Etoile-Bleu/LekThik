use application::SetCardLabels;
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{CardLabelsResponseDto, ErrorResponseDto, SetCardLabelsRequestDto};
use crate::state::AppState;

#[utoipa::path(
    put,
    path = "/cards/{id}/labels",
    tag = "cards",
    summary = "Replace the labels of a card",
    description = "Sets the exact list of labels carried by the card. Every label must belong to the card's board.",
    params(("id" = Uuid, Path, description = "Card id")),
    request_body = SetCardLabelsRequestDto,
    responses(
        (status = 200, body = CardLabelsResponseDto),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn set_card_labels(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<SetCardLabelsRequestDto>,
) -> Response {
    let use_case = SetCardLabels::new(state.card_repo.clone());

    match use_case.execute(user_id, id, payload.label_ids).await {
        Ok(label_ids) => {
            (StatusCode::OK, Json(CardLabelsResponseDto { label_ids })).into_response()
        }
        Err(error) => boards_error_response(error),
    }
}
