use application::{ConfirmUser, LoginUser, LoginUserError, RegisterUser, RegisterUserError};
use axum::Json;
use axum::extract::{Query, State};
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use domain::ConfirmUserError;
use serde::Deserialize;
use utoipa::IntoParams;
use uuid::Uuid;
use validator::Validate;

use crate::session_handlers::SESSION_COOKIE;
use crate::state::AppState;
use crate::user_dto::{
    ErrorResponseDto, LoginUserRequestDto, RegisterUserRequestDto, RegisteredUserResponseDto,
    UserResponseDto,
};

#[derive(Deserialize, IntoParams)]
pub struct ConfirmQuery {
    pub token: Uuid,
}

#[utoipa::path(
    post,
    path = "/users/register",
    tag = "users",
    summary = "Register a new user",
    description = "Creates a user with an argon2-hashed password and a confirmation token. Rejects an email already in use.",
    request_body = RegisterUserRequestDto,
    responses(
        (status = 201, body = RegisteredUserResponseDto),
        (status = 400, body = ErrorResponseDto),
        (status = 409, body = ErrorResponseDto),
    )
)]
pub async fn register_user(
    State(state): State<AppState>,
    Json(payload): Json<RegisterUserRequestDto>,
) -> Response {
    if let Err(validation_errors) = payload.validate() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponseDto {
                message: validation_errors.to_string(),
            }),
        )
            .into_response();
    }

    let use_case = RegisterUser::new(state.user_repo.clone());

    match use_case.execute(payload.email, &payload.password).await {
        Ok(registered) => {
            println!(
                "registered {}, confirmation token {}",
                registered.email, registered.confirmation_token
            );

            (
                StatusCode::CREATED,
                Json(RegisteredUserResponseDto {
                    id: registered.id,
                    email: registered.email,
                }),
            )
                .into_response()
        }
        Err(RegisterUserError::EmailAlreadyRegistered) => (
            StatusCode::CONFLICT,
            Json(ErrorResponseDto {
                message: "email already registered".to_string(),
            }),
        )
            .into_response(),
        Err(error @ (RegisterUserError::HashingFailed | RegisterUserError::Repository(_))) => {
            eprintln!("register_user failed: {error}");

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
    path = "/users/confirm",
    tag = "users",
    summary = "Confirm a user's email",
    description = "Confirms a registered user's account by its confirmation token.",
    params(ConfirmQuery),
    responses(
        (status = 200, body = UserResponseDto),
        (status = 404, body = ErrorResponseDto),
    )
)]
pub async fn confirm_user(
    State(state): State<AppState>,
    Query(query): Query<ConfirmQuery>,
) -> Response {
    let use_case = ConfirmUser::new(state.user_repo.clone());

    match use_case.execute(query.token).await {
        Ok(user) => (
            StatusCode::OK,
            Json(UserResponseDto {
                id: user.id,
                email: user.email,
                confirmed: user.confirmed,
            }),
        )
            .into_response(),
        Err(ConfirmUserError::TokenNotFound) => (
            StatusCode::NOT_FOUND,
            Json(ErrorResponseDto {
                message: "confirmation token not found".to_string(),
            }),
        )
            .into_response(),
        Err(error @ ConfirmUserError::Repository(_)) => {
            eprintln!("confirm_user failed: {error}");

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
    post,
    path = "/auth/login",
    tag = "auth",
    summary = "Log in with email and password",
    description = "Verifies the password against the stored argon2 hash and sets a session cookie carrying a short-lived JWT.",
    request_body = LoginUserRequestDto,
    responses(
        (status = 204, description = "Session cookie set"),
        (status = 400, body = ErrorResponseDto),
        (status = 401, body = ErrorResponseDto),
    )
)]
pub async fn login_user(
    State(state): State<AppState>,
    Json(payload): Json<LoginUserRequestDto>,
) -> Response {
    if let Err(validation_errors) = payload.validate() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponseDto {
                message: validation_errors.to_string(),
            }),
        )
            .into_response();
    }

    let use_case = LoginUser::new(state.user_repo.clone());

    let user = match use_case.execute(&payload.email, &payload.password).await {
        Ok(user) => user,
        Err(error @ (LoginUserError::InvalidCredentials | LoginUserError::EmailNotConfirmed)) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ErrorResponseDto {
                    message: error.to_string(),
                }),
            )
                .into_response();
        }
        Err(error @ LoginUserError::Repository(_)) => {
            eprintln!("login_user failed: {error}");

            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponseDto {
                    message: "internal server error".to_string(),
                }),
            )
                .into_response();
        }
    };

    let token = match state.token_issuer.issue(user.id) {
        Ok(token) => token,
        Err(error) => {
            eprintln!("issuing session token failed: {error}");

            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponseDto {
                    message: "internal server error".to_string(),
                }),
            )
                .into_response();
        }
    };

    let mut response = StatusCode::NO_CONTENT.into_response();
    response.headers_mut().append(
        header::SET_COOKIE,
        HeaderValue::from_str(&format!(
            "{SESSION_COOKIE}={token}; HttpOnly; Secure; SameSite=Lax; Path=/"
        ))
        .unwrap_or(HeaderValue::from_static("")),
    );
    response
}
