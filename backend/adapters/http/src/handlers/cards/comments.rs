use application::{AddComment, DeleteComment, EditComment, GetTimeline};
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{CommentDto, CommentRequestDto, ErrorResponseDto, TimelineResponseDto};
use crate::state::AppState;

#[utoipa::path(
    get,
    path = "/cards/{id}/timeline",
    tag = "cards",
    summary = "What was said and what happened on a card",
    description = "Comments and history lines merged, oldest first, the latest 200 at most. Any member of the workspace can read it, readers included.",
    params(("id" = Uuid, Path, description = "Card id")),
    responses(
        (status = 200, body = TimelineResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn get_card_timeline(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let use_case = GetTimeline::new(state.comment_repo.clone());

    match use_case.execute(user_id, id).await {
        Ok(items) => (
            StatusCode::OK,
            Json(TimelineResponseDto {
                items: items.into_iter().map(Into::into).collect(),
            }),
        )
            .into_response(),
        Err(error) => boards_error_response(error),
    }
}

#[utoipa::path(
    post,
    path = "/cards/{id}/comments",
    tag = "cards",
    summary = "Comment on a card",
    description = "Adds a comment written in Markdown, up to 5000 characters. Writers and above can comment, at most 500 comments a card and 20 a minute for one person.",
    params(("id" = Uuid, Path, description = "Card id")),
    request_body = CommentRequestDto,
    responses(
        (status = 201, body = CommentDto),
        (status = 400, description = "Empty, too long or with control characters", body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 403, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
        (status = 409, description = "Too many comments", body = ErrorResponseDto),
    )
)]
pub async fn add_card_comment(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    Json(payload): Json<CommentRequestDto>,
) -> Response {
    let use_case = AddComment::new(state.comment_repo.clone());

    match use_case.execute(user_id, id, &payload.body).await {
        Ok(comment) => (StatusCode::CREATED, Json(CommentDto::from(comment))).into_response(),
        Err(error) => boards_error_response(error),
    }
}

#[utoipa::path(
    patch,
    path = "/cards/{id}/comments/{comment_id}",
    tag = "cards",
    summary = "Edit a comment",
    description = "Only the author can edit a comment, and the comment then shows an edited time.",
    params(
        ("id" = Uuid, Path, description = "Card id"),
        ("comment_id" = Uuid, Path, description = "Comment id"),
    ),
    request_body = CommentRequestDto,
    responses(
        (status = 200, body = CommentDto),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 403, description = "Written by someone else", body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn edit_card_comment(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path((id, comment_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<CommentRequestDto>,
) -> Response {
    let use_case = EditComment::new(state.comment_repo.clone());

    match use_case
        .execute(user_id, id, comment_id, &payload.body)
        .await
    {
        Ok(comment) => (StatusCode::OK, Json(CommentDto::from(comment))).into_response(),
        Err(error) => boards_error_response(error),
    }
}

#[utoipa::path(
    delete,
    path = "/cards/{id}/comments/{comment_id}",
    tag = "cards",
    summary = "Delete a comment",
    description = "The author can delete their comment, and so can an admin or an owner of the workspace.",
    params(
        ("id" = Uuid, Path, description = "Card id"),
        ("comment_id" = Uuid, Path, description = "Comment id"),
    ),
    responses(
        (status = 204, description = "Deleted"),
        (status = 401, body = ErrorResponseDto),
        (status = 403, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn delete_card_comment(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path((id, comment_id)): Path<(Uuid, Uuid)>,
) -> Response {
    let use_case = DeleteComment::new(state.comment_repo.clone());

    match use_case.execute(user_id, id, comment_id).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => boards_error_response(error),
    }
}
