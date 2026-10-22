use application::{GetBlockImage, SetBlockImage};
use axum::Json;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{BlockImageResponseDto, ErrorResponseDto};
use crate::state::AppState;

#[utoipa::path(
    put,
    path = "/blocks/{id}/image",
    tag = "lists",
    summary = "Set the picture of an image block",
    description = "The body is the picture itself, at most 5 MB. Only real PNG, JPEG and WebP pictures are accepted, judged by their bytes. The server decodes the picture and writes a new one from its pixels, so every piece of metadata (position, camera, time, author) is dropped, and it is kept in the database, never at a public address.",
    params(("id" = Uuid, Path, description = "Block id")),
    request_body(content = Vec<u8>, content_type = "application/octet-stream"),
    responses(
        (status = 200, body = BlockImageResponseDto),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 403, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
        (status = 413, description = "The picture is larger than 5 MB"),
    )
)]
pub async fn set_block_image(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
    body: Bytes,
) -> Response {
    let use_case = SetBlockImage::new(
        state.image_sanitizer.clone(),
        state.block_image_repo.clone(),
    );

    match use_case.execute(user_id, id, body.to_vec()).await {
        Ok(image_version) => (
            StatusCode::OK,
            Json(BlockImageResponseDto { image_version }),
        )
            .into_response(),
        Err(error) => boards_error_response(error),
    }
}

#[utoipa::path(
    get,
    path = "/blocks/{id}/image",
    tag = "lists",
    summary = "Get the picture of an image block",
    description = "Only for members of the workspace. Served as the type it was stored with, never sniffed, and never cached by shared caches.",
    params(("id" = Uuid, Path, description = "Block id")),
    responses(
        (status = 200, description = "The picture", content_type = "image/jpeg"),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn get_block_image(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let use_case = GetBlockImage::new(state.block_image_repo.clone());

    match use_case.execute(user_id, id).await {
        Ok(image) => {
            let Ok(content_type) = HeaderValue::from_str(&image.content_type) else {
                return StatusCode::INTERNAL_SERVER_ERROR.into_response();
            };
            let mut response = (StatusCode::OK, image.bytes).into_response();
            response
                .headers_mut()
                .insert(header::CONTENT_TYPE, content_type);
            response.headers_mut().insert(
                header::CONTENT_DISPOSITION,
                HeaderValue::from_static("inline; filename=\"picture\""),
            );
            response
        }
        Err(error) => boards_error_response(error),
    }
}
