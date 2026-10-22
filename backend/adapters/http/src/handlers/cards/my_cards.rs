use application::ListMyCards;
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{AssignedCardDto, ErrorResponseDto};
use crate::state::AppState;

#[utoipa::path(
    get,
    path = "/users/me/cards",
    tag = "cards",
    summary = "List the cards assigned to me",
    description = "Every card assigned to the signed in user in the workspaces they belong to, soonest due date first and cards without a date last. At most 500 cards.",
    responses(
        (status = 200, body = Vec<AssignedCardDto>),
        (status = 401, body = ErrorResponseDto),
    )
)]
pub async fn list_my_cards(State(state): State<AppState>, AuthUser(user_id): AuthUser) -> Response {
    let use_case = ListMyCards::new(state.card_repo.clone());

    match use_case.execute(user_id).await {
        Ok(cards) => (
            StatusCode::OK,
            Json(
                cards
                    .into_iter()
                    .map(AssignedCardDto::from)
                    .collect::<Vec<_>>(),
            ),
        )
            .into_response(),
        Err(error) => boards_error_response(error),
    }
}
