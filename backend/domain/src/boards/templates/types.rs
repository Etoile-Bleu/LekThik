use crate::boards::{LabelColor, Priority};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TemplateCategory {
    Engineering,
    Product,
    Marketing,
    People,
    Personal,
    School,
}

impl TemplateCategory {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Engineering => "Engineering",
            Self::Product => "Product",
            Self::Marketing => "Marketing",
            Self::People => "People",
            Self::Personal => "Personal",
            Self::School => "School",
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct TemplateLabel {
    pub name: &'static str,
    pub color: LabelColor,
    pub priority: Priority,
}

#[derive(Debug, Clone, Copy)]
pub struct TemplateCard {
    pub title: &'static str,
    pub description: &'static str,
    pub labels: &'static [&'static str],
}

#[derive(Debug, Clone, Copy)]
pub struct TemplateList {
    pub name: &'static str,
    pub cards: &'static [TemplateCard],
}

#[derive(Debug, Clone, Copy)]
pub struct BoardTemplate {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub category: TemplateCategory,
    pub labels: &'static [TemplateLabel],
    pub lists: &'static [TemplateList],
}

#[derive(Debug, Clone, Copy)]
pub struct WorkspaceTemplate {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub board_ids: &'static [&'static str],
}
