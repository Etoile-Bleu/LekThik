use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use domain::boards::BoardsError;

use crate::dto::ErrorResponseDto;

pub fn boards_error_response(error: BoardsError) -> Response {
    let (status, message) = match error {
        BoardsError::NotFound => (StatusCode::NOT_FOUND, "not found".to_string()),
        BoardsError::Forbidden => (
            StatusCode::FORBIDDEN,
            "your role does not allow this".to_string(),
        ),
        BoardsError::Conflict(message) => (StatusCode::CONFLICT, message),
        BoardsError::LimitReached(what) => (
            StatusCode::CONFLICT,
            format!("you have reached the limit of {what}"),
        ),
        BoardsError::Invalid(message) => (StatusCode::BAD_REQUEST, message),
        BoardsError::Repository(message) => {
            eprintln!("boards repository failed: {message}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "internal server error".to_string(),
            )
        }
    };

    (status, Json(ErrorResponseDto { message })).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_each_error_to_its_status() {
        let cases = [
            (BoardsError::NotFound, StatusCode::NOT_FOUND),
            (BoardsError::LimitReached("cards"), StatusCode::CONFLICT),
            (BoardsError::Forbidden, StatusCode::FORBIDDEN),
            (BoardsError::Conflict("x".to_string()), StatusCode::CONFLICT),
            (
                BoardsError::Invalid("bad".to_string()),
                StatusCode::BAD_REQUEST,
            ),
            (
                BoardsError::Repository("boom".to_string()),
                StatusCode::INTERNAL_SERVER_ERROR,
            ),
        ];

        for (error, status) in cases {
            assert_eq!(boards_error_response(error).status(), status);
        }
    }
}
