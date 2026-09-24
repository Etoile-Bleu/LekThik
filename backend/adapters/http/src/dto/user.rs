use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;
use validator::Validate;

#[derive(Deserialize, Validate, ToSchema)]
pub struct RegisterUserRequestDto {
    #[validate(email)]
    pub email: String,
    #[validate(length(min = 3, max = 32))]
    pub username: String,
    #[validate(length(min = 8))]
    pub password: String,
}

#[derive(Serialize, ToSchema)]
pub struct RegisteredUserResponseDto {
    pub id: Uuid,
    pub email: String,
    pub username: String,
}

#[derive(Serialize, ToSchema)]
pub struct UserResponseDto {
    pub id: Uuid,
    pub email: String,
    pub username: String,
}

#[derive(Deserialize, Validate, ToSchema)]
pub struct LoginUserRequestDto {
    #[validate(email)]
    pub email: String,
    #[validate(length(min = 1))]
    pub password: String,
}
