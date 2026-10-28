use application::{DeleteAccount, ExportAccount};
use axum::Json;
use axum::extract::State;
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use domain::AccountError;
use serde_json::json;

use crate::auth::AuthUser;
use crate::dto::{DeleteAccountRequestDto, ErrorResponseDto};
use crate::state::{AppState, SESSION_COOKIE};

fn failure(error: AccountError) -> Response {
    match error {
        AccountError::Invalid(message) => {
            (StatusCode::BAD_REQUEST, Json(ErrorResponseDto { message })).into_response()
        }
        AccountError::WrongPassword => (
            StatusCode::FORBIDDEN,
            Json(ErrorResponseDto {
                message: "wrong password".to_string(),
            }),
        )
            .into_response(),
        AccountError::NotFound => (
            StatusCode::NOT_FOUND,
            Json(ErrorResponseDto {
                message: "account not found".to_string(),
            }),
        )
            .into_response(),
        AccountError::Blocked(workspaces) => (
            StatusCode::CONFLICT,
            Json(json!({
                "message": "some workspaces you own still have other members",
                "workspaces": workspaces,
            })),
        )
            .into_response(),
        AccountError::Repository(message) => {
            eprintln!("account repository failed: {message}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponseDto {
                    message: "internal server error".to_string(),
                }),
            )
                .into_response()
        }
    }
}

#[utoipa::path(
    get,
    path = "/users/me/export",
    tag = "users",
    summary = "Download my data",
    description = "Everything the account holds about the signed in person as one JSON file: profile, display preferences, workspace memberships, assigned cards, comments written and poll votes cast. Never the password hash, a token or a code. The answer is not cached and the route is rate limited.",
    responses(
        (status = 200, description = "A JSON file", body = Object),
        (status = 401, body = ErrorResponseDto),
        (status = 404, body = ErrorResponseDto),
        (status = 429, body = ErrorResponseDto),
    )
)]
pub async fn export_account(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
) -> Response {
    match ExportAccount::new(state.account_repo.clone())
        .execute(user_id)
        .await
    {
        Ok(data) => {
            let mut response = (StatusCode::OK, Json(data)).into_response();
            let headers = response.headers_mut();
            headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
            headers.insert(
                header::CONTENT_DISPOSITION,
                HeaderValue::from_static("attachment; filename=\"lekthik-my-data.json\""),
            );
            response
        }
        Err(error) => failure(error),
    }
}

#[utoipa::path(
    delete,
    path = "/users/me",
    tag = "users",
    summary = "Delete my account",
    description = "Permanently deletes the account after the password and the username are given again. Comments and history lines written stay without an author. Votes, assignments, memberships and preferences are removed. A workspace the person owns that still has other members blocks the deletion with 409 and the list of those workspaces, unless `delete_owned_workspaces` is true, which deletes them with everything in them. Workspaces owned alone are always deleted. The session cookie is cleared.",
    request_body = DeleteAccountRequestDto,
    responses(
        (status = 204, description = "Account deleted"),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
        (status = 403, description = "Wrong password", body = ErrorResponseDto),
        (status = 409, description = "Workspaces with other members are still owned", body = Object),
        (status = 429, body = ErrorResponseDto),
    )
)]
pub async fn delete_account(
    State(state): State<AppState>,
    AuthUser(user_id): AuthUser,
    Json(payload): Json<DeleteAccountRequestDto>,
) -> Response {
    let use_case = DeleteAccount::new(state.user_repo.clone(), state.account_repo.clone());

    match use_case
        .execute(
            user_id,
            &payload.password,
            &payload.confirmation,
            payload.delete_owned_workspaces,
        )
        .await
    {
        Ok(()) => {
            let mut response = StatusCode::NO_CONTENT.into_response();
            response.headers_mut().append(
                header::SET_COOKIE,
                HeaderValue::from_str(&format!(
                    "{SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
                ))
                .unwrap_or(HeaderValue::from_static("")),
            );
            response
        }
        Err(error) => failure(error),
    }
}
