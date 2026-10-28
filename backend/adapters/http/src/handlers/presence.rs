use std::time::Instant;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use domain::boards::{BoardsError, Target};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::ErrorResponseDto;
use crate::events::Change;
use crate::presence::{Touched, valid_client_id};
use crate::state::AppState;

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct PresenceRequestDto {
    /// The identifier this browser tab invented for itself: letters, digits and dashes, at most 64.
    pub client_id: String,
    /// The card this person has open, if any. It must belong to the board.
    #[serde(default)]
    pub card_id: Option<Uuid>,
    /// `false` when the person leaves, so the others stop seeing them at once.
    #[serde(default = "present")]
    pub present: bool,
}

fn present() -> bool {
    true
}

#[derive(Serialize, ToSchema)]
pub struct ViewerDto {
    pub user_id: Uuid,
    pub username: String,
    /// The card this person has open, `null` when they are only on the board.
    pub card_id: Option<Uuid>,
}

#[derive(Serialize, ToSchema)]
pub struct PresenceResponseDto {
    pub viewers: Vec<ViewerDto>,
}

/// The workspace of a board, only when the person belongs to it. A stranger learns nothing,
/// not even whether the board exists.
async fn workspace_of(
    state: &AppState,
    user_id: Uuid,
    board_id: Uuid,
) -> Result<Uuid, BoardsError> {
    let located = state
        .locator
        .locate(Target::Board(board_id))
        .await?
        .ok_or(BoardsError::NotFound)?;
    let workspaces = state.member_repo.workspace_ids_of(user_id).await?;
    if workspaces.contains(&located.workspace_id) {
        Ok(located.workspace_id)
    } else {
        Err(BoardsError::NotFound)
    }
}

fn tell(state: &AppState, touched: impl IntoIterator<Item = Touched>) {
    for item in touched {
        state.events.publish(
            Change::Presence {
                workspace_id: item.workspace_id,
                board_id: item.board_id,
            },
            None,
        );
    }
}

#[utoipa::path(
    put,
    path = "/boards/{id}/presence",
    tag = "presence",
    summary = "Say where you are on a board",
    description = "Reports that this browser tab is on the board, and on a card or not. It is repeated about every 20 seconds and expires by itself after 50. Members of the workspace see who is on the board. It is kept in memory only, never stored, and a person who chose to hide their presence in the settings is not recorded.",
    params(("id" = Uuid, Path, description = "Board id")),
    request_body = PresenceRequestDto,
    responses(
        (status = 204, description = "Recorded, or ignored because this person hides their presence"),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn put_presence(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(board_id): Path<Uuid>,
    Json(payload): Json<PresenceRequestDto>,
) -> Response {
    if !valid_client_id(&payload.client_id) {
        return boards_error_response(BoardsError::Invalid(
            "the client id is letters, digits and dashes, at most 64".to_string(),
        ));
    }
    let workspace_id = match workspace_of(&state, user_id, board_id).await {
        Ok(id) => id,
        Err(error) => return boards_error_response(error),
    };

    if !payload.present {
        tell(&state, state.presence.leave(&payload.client_id, user_id));
        return StatusCode::NO_CONTENT.into_response();
    }

    if let Some(card_id) = payload.card_id {
        match state.locator.locate(Target::Card(card_id)).await {
            Ok(Some(located)) if located.board_id == Some(board_id) => {}
            Ok(_) => {
                return boards_error_response(BoardsError::Invalid(
                    "the card is not on this board".to_string(),
                ));
            }
            Err(error) => return boards_error_response(error),
        }
    }

    // Who the person is, and whether they hide, is read when a tab first reports, not on every beat.
    let username = if state.presence.knows(&payload.client_id, user_id) {
        None
    } else {
        let hidden = match state.preferences_repo.get(user_id).await {
            Ok(preferences) => preferences.is_some_and(|saved| saved.hide_presence),
            Err(error) => {
                eprintln!("reading presence preferences failed: {error}");
                false
            }
        };
        if hidden {
            return StatusCode::NO_CONTENT.into_response();
        }
        match state.user_repo.find_by_id(user_id).await {
            Ok(Some(user)) => Some(user.username),
            Ok(None) => return boards_error_response(BoardsError::NotFound),
            Err(error) => {
                return boards_error_response(BoardsError::Repository(error.to_string()));
            }
        }
    };

    let username = match username {
        Some(name) => name,
        None => state
            .presence
            .viewers(board_id, Instant::now())
            .into_iter()
            .find(|viewer| viewer.user_id == user_id)
            .map(|viewer| viewer.username)
            .unwrap_or_default(),
    };

    tell(
        &state,
        state.presence.beat(
            &payload.client_id,
            user_id,
            &username,
            workspace_id,
            board_id,
            payload.card_id,
            Instant::now(),
        ),
    );
    StatusCode::NO_CONTENT.into_response()
}

#[utoipa::path(
    get,
    path = "/boards/{id}/presence",
    tag = "presence",
    summary = "Who is on a board",
    description = "The members of the workspace who have this board open right now, one each, and the card each has open. Only members can ask.",
    params(("id" = Uuid, Path, description = "Board id")),
    responses(
        (status = 200, body = PresenceResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn get_presence(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(board_id): Path<Uuid>,
) -> Response {
    if let Err(error) = workspace_of(&state, user_id, board_id).await {
        return boards_error_response(error);
    }
    let viewers = state
        .presence
        .viewers(board_id, Instant::now())
        .into_iter()
        .map(|viewer| ViewerDto {
            user_id: viewer.user_id,
            username: viewer.username,
            card_id: viewer.card_id,
        })
        .collect();

    (StatusCode::OK, Json(PresenceResponseDto { viewers })).into_response()
}
