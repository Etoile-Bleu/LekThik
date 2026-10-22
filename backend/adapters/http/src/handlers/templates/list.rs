use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use domain::boards::{board_templates, workspace_templates};

use crate::auth::AuthUser;
use crate::dto::{ErrorResponseDto, TemplatesResponseDto};

#[utoipa::path(
    get,
    path = "/templates",
    tag = "templates",
    summary = "List the workspace and board templates",
    description = "Returns the catalogue of ready made boards, with their lists, sample cards and labels so a client can preview them, and the workspace templates that bundle several boards.",
    responses(
        (status = 200, body = TemplatesResponseDto),
        (status = 401, body = ErrorResponseDto),
    )
)]
pub async fn list_templates(_user: AuthUser) -> Response {
    let body = TemplatesResponseDto {
        boards: board_templates()
            .iter()
            .map(|template| (*template).into())
            .collect(),
        workspaces: workspace_templates().iter().map(Into::into).collect(),
    };

    (StatusCode::OK, Json(body)).into_response()
}
