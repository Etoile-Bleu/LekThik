use application::{
    AddFieldOption, CreateField, DeleteField, DeleteFieldOption, NewOption, SetCardField,
    UpdateField, UpdateFieldOption,
};
use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::{
    CreateFieldRequestDto, ErrorResponseDto, FieldDto, FieldValueResponseDto, NewOptionDto,
    SetFieldValueRequestDto, UpdateFieldRequestDto, UpdateOptionRequestDto, value_json,
};
use crate::state::AppState;

#[utoipa::path(
    post,
    path = "/boards/{id}/fields",
    tag = "fields",
    summary = "Define a field",
    description = "Adds a property cards can carry a value for: text, number, date, select, checkbox or url. A select field starts with its choices. Admins and owners only, up to 30 fields a board, names unique ignoring case.",
    params(("id" = Uuid, Path, description = "Board id")),
    request_body = CreateFieldRequestDto,
    responses(
        (status = 201, body = FieldDto),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 403, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
        (status = 409, description = "Name taken or limit reached", body = ErrorResponseDto),
    )
)]
pub async fn create_field(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path(board_id): Path<Uuid>,
    Json(payload): Json<CreateFieldRequestDto>,
) -> Response {
    let use_case = CreateField::new(state.field_repo.clone());
    let options = payload
        .options
        .into_iter()
        .map(|NewOptionDto { name, color }| NewOption { name, color })
        .collect();

    match use_case
        .execute(
            user_id,
            board_id,
            &payload.name,
            &payload.kind,
            options,
            payload.show_on_card,
        )
        .await
    {
        Ok(field) => (StatusCode::CREATED, Json(FieldDto::from(field))).into_response(),
        Err(error) => boards_error_response(error),
    }
}

#[utoipa::path(
    patch,
    path = "/boards/{id}/fields/{field_id}",
    tag = "fields",
    summary = "Rename, move or show a field on the cards",
    description = "Changes the name, the position or whether the value shows on the card. The kind of a field cannot change. Admins and owners only.",
    params(
        ("id" = Uuid, Path, description = "Board id"),
        ("field_id" = Uuid, Path, description = "Field id"),
    ),
    request_body = UpdateFieldRequestDto,
    responses(
        (status = 200, body = FieldDto),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 403, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
        (status = 409, description = "Name taken", body = ErrorResponseDto),
    )
)]
pub async fn update_field(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path((board_id, field_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<UpdateFieldRequestDto>,
) -> Response {
    let use_case = UpdateField::new(state.field_repo.clone());

    match use_case
        .execute(
            user_id,
            board_id,
            field_id,
            payload.name.as_deref(),
            payload.show_on_card,
            payload.position,
        )
        .await
    {
        Ok(field) => (StatusCode::OK, Json(FieldDto::from(field))).into_response(),
        Err(error) => boards_error_response(error),
    }
}

#[utoipa::path(
    delete,
    path = "/boards/{id}/fields/{field_id}",
    tag = "fields",
    summary = "Delete a field",
    description = "Deletes the field and every value cards held for it. Admins and owners only.",
    params(
        ("id" = Uuid, Path, description = "Board id"),
        ("field_id" = Uuid, Path, description = "Field id"),
    ),
    responses(
        (status = 204, description = "Deleted"),
        (status = 401, body = ErrorResponseDto),
        (status = 403, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn delete_field(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path((board_id, field_id)): Path<(Uuid, Uuid)>,
) -> Response {
    let use_case = DeleteField::new(state.field_repo.clone());

    match use_case.execute(user_id, board_id, field_id).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(error) => boards_error_response(error),
    }
}

#[utoipa::path(
    post,
    path = "/boards/{id}/fields/{field_id}/options",
    tag = "fields",
    summary = "Add a choice to a select field",
    description = "Adds a choice with a name and a colour from the fixed palette, up to 50 a field. Admins and owners only.",
    params(
        ("id" = Uuid, Path, description = "Board id"),
        ("field_id" = Uuid, Path, description = "Field id"),
    ),
    request_body = NewOptionDto,
    responses(
        (status = 201, description = "The field with its choices", body = FieldDto),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 403, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
        (status = 409, description = "Name taken or limit reached", body = ErrorResponseDto),
    )
)]
pub async fn add_field_option(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path((board_id, field_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<NewOptionDto>,
) -> Response {
    let use_case = AddFieldOption::new(state.field_repo.clone());

    match use_case
        .execute(user_id, board_id, field_id, &payload.name, &payload.color)
        .await
    {
        Ok(field) => (StatusCode::CREATED, Json(FieldDto::from(field))).into_response(),
        Err(error) => boards_error_response(error),
    }
}

#[utoipa::path(
    patch,
    path = "/boards/{id}/fields/{field_id}/options/{option_id}",
    tag = "fields",
    summary = "Rename or recolour a choice",
    description = "Cards keep their choice, since they hold its identifier and not its name. Admins and owners only.",
    params(
        ("id" = Uuid, Path, description = "Board id"),
        ("field_id" = Uuid, Path, description = "Field id"),
        ("option_id" = Uuid, Path, description = "Choice id"),
    ),
    request_body = UpdateOptionRequestDto,
    responses(
        (status = 200, body = FieldDto),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 403, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
        (status = 409, description = "Name taken", body = ErrorResponseDto),
    )
)]
pub async fn update_field_option(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path((board_id, field_id, option_id)): Path<(Uuid, Uuid, Uuid)>,
    Json(payload): Json<UpdateOptionRequestDto>,
) -> Response {
    let use_case = UpdateFieldOption::new(state.field_repo.clone());

    match use_case
        .execute(
            user_id,
            board_id,
            field_id,
            option_id,
            payload.name.as_deref(),
            payload.color.as_deref(),
        )
        .await
    {
        Ok(field) => (StatusCode::OK, Json(FieldDto::from(field))).into_response(),
        Err(error) => boards_error_response(error),
    }
}

#[utoipa::path(
    delete,
    path = "/boards/{id}/fields/{field_id}/options/{option_id}",
    tag = "fields",
    summary = "Delete a choice",
    description = "Cards that held this choice lose their value, they are never moved to another choice. Admins and owners only.",
    params(
        ("id" = Uuid, Path, description = "Board id"),
        ("field_id" = Uuid, Path, description = "Field id"),
        ("option_id" = Uuid, Path, description = "Choice id"),
    ),
    responses(
        (status = 200, body = FieldDto),
        (status = 401, body = ErrorResponseDto),
        (status = 403, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn delete_field_option(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path((board_id, field_id, option_id)): Path<(Uuid, Uuid, Uuid)>,
) -> Response {
    let use_case = DeleteFieldOption::new(state.field_repo.clone());

    match use_case
        .execute(user_id, board_id, field_id, option_id)
        .await
    {
        Ok(field) => (StatusCode::OK, Json(FieldDto::from(field))).into_response(),
        Err(error) => boards_error_response(error),
    }
}

#[utoipa::path(
    put,
    path = "/cards/{id}/fields/{field_id}",
    tag = "fields",
    summary = "Set or clear the value of a field on a card",
    description = "Sets the value of one field, whose shape must fit its kind: a string for text, url, date (YYYY-MM-DD) and the id of a choice for select, a decimal string for a number (up to 12 digits before the point and 6 after), a boolean for a checkbox. `null` or a blank string clears it. Writers and above.",
    params(
        ("id" = Uuid, Path, description = "Card id"),
        ("field_id" = Uuid, Path, description = "Field id"),
    ),
    request_body = SetFieldValueRequestDto,
    responses(
        (status = 200, body = FieldValueResponseDto),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 403, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn set_card_field(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Path((card_id, field_id)): Path<(Uuid, Uuid)>,
    Json(payload): Json<SetFieldValueRequestDto>,
) -> Response {
    let use_case = SetCardField::new(state.field_repo.clone());

    match use_case
        .execute(user_id, card_id, field_id, &payload.value)
        .await
    {
        Ok(saved) => (
            StatusCode::OK,
            Json(FieldValueResponseDto {
                value: saved
                    .as_ref()
                    .map(value_json)
                    .unwrap_or(serde_json::Value::Null),
            }),
        )
            .into_response(),
        Err(error) => boards_error_response(error),
    }
}
