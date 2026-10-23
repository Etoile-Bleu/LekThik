use application::{PanelPlacementInput, SetBoardLayout};
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{ErrorResponseDto, SetLayoutRequestDto};
use crate::state::AppState;

#[utoipa::path(
    put,
    path = "/boards/{id}/layout",
    tag = "boards",
    summary = "Place the panels of a board on the free layout",
    description = "Sets where lists and blocks sit on a 12 column grid and how big they are, shared with everybody who can open the board. Every tile stays inside the 12 columns and the first 400 rows, and every panel must belong to the board. Panels that are left out keep their place. Writers and above can change it.",
    params(("id" = Uuid, Path, description = "Board id")),
    request_body = SetLayoutRequestDto,
    responses(
        (status = 204, description = "The layout was stored"),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 403, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn set_board_layout(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<SetLayoutRequestDto>,
) -> Response {
    let use_case = SetBoardLayout::new(state.board_repo.clone());
    let items = payload
        .items
        .into_iter()
        .map(|item| PanelPlacementInput {
            id: item.id,
            x: item.placement.x,
            y: item.placement.y,
            w: item.placement.w,
            h: item.placement.h,
        })
        .collect();

    match use_case.execute(user_id, id, items).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => boards_error_response(error),
    }
}
