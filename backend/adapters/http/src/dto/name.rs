use serde::Deserialize;
use utoipa::ToSchema;

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct NameRequestDto {
    pub name: String,
}

#[derive(Deserialize, ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateNamedRequestDto {
    pub name: String,
    #[schema(example = "sprint-planning")]
    pub template_id: Option<String>,
}
