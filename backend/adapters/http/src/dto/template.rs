use domain::boards::{BoardTemplate, TemplateCard, TemplateLabel, TemplateList, WorkspaceTemplate};
use serde::Serialize;
use utoipa::ToSchema;

#[derive(Serialize, ToSchema)]
pub struct TemplateLabelDto {
    pub name: &'static str,
    #[schema(example = "red")]
    pub color: &'static str,
    #[schema(example = "urgent")]
    pub priority: &'static str,
}

impl From<&TemplateLabel> for TemplateLabelDto {
    fn from(label: &TemplateLabel) -> Self {
        Self {
            name: label.name,
            color: label.color.as_str(),
            priority: label.priority.as_str(),
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct TemplateCardDto {
    pub title: &'static str,
    pub description: &'static str,
    pub labels: Vec<&'static str>,
}

impl From<&TemplateCard> for TemplateCardDto {
    fn from(card: &TemplateCard) -> Self {
        Self {
            title: card.title,
            description: card.description,
            labels: card.labels.to_vec(),
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct TemplateListDto {
    pub name: &'static str,
    pub cards: Vec<TemplateCardDto>,
}

impl From<&TemplateList> for TemplateListDto {
    fn from(list: &TemplateList) -> Self {
        Self {
            name: list.name,
            cards: list.cards.iter().map(Into::into).collect(),
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct BoardTemplateDto {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub category: &'static str,
    pub labels: Vec<TemplateLabelDto>,
    pub lists: Vec<TemplateListDto>,
}

impl From<&BoardTemplate> for BoardTemplateDto {
    fn from(template: &BoardTemplate) -> Self {
        Self {
            id: template.id,
            name: template.name,
            description: template.description,
            category: template.category.as_str(),
            labels: template.labels.iter().map(Into::into).collect(),
            lists: template.lists.iter().map(Into::into).collect(),
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct WorkspaceTemplateDto {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub board_ids: Vec<&'static str>,
}

impl From<&WorkspaceTemplate> for WorkspaceTemplateDto {
    fn from(template: &WorkspaceTemplate) -> Self {
        Self {
            id: template.id,
            name: template.name,
            description: template.description,
            board_ids: template.board_ids.to_vec(),
        }
    }
}

#[derive(Serialize, ToSchema)]
pub struct TemplatesResponseDto {
    pub boards: Vec<BoardTemplateDto>,
    pub workspaces: Vec<WorkspaceTemplateDto>,
}
