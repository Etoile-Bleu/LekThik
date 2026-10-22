use super::types::{BoardTemplate, TemplateCard, TemplateCategory, TemplateLabel, TemplateList};
use crate::boards::{LabelColor, Priority};

pub static SCHOOL_PROJECT: BoardTemplate = BoardTemplate {
    id: "school-project",
    name: "School project",
    description: "Split a group project into research, building and review, and keep the deadline in sight.",
    category: TemplateCategory::School,
    labels: &[
        TemplateLabel {
            name: "Due soon",
            color: LabelColor::Red,
            priority: Priority::Urgent,
        },
        TemplateLabel {
            name: "Report",
            color: LabelColor::Blue,
            priority: Priority::Unset,
        },
        TemplateLabel {
            name: "Code",
            color: LabelColor::Teal,
            priority: Priority::Unset,
        },
        TemplateLabel {
            name: "Presentation",
            color: LabelColor::Pink,
            priority: Priority::Unset,
        },
    ],
    lists: &[
        TemplateList {
            name: "Backlog",
            cards: &[
                TemplateCard {
                    title: "Choose the subject",
                    description: "Each member proposes one, then vote.",
                    labels: &[],
                },
                TemplateCard {
                    title: "Agree on who does what",
                    description: "",
                    labels: &[],
                },
            ],
        },
        TemplateList {
            name: "Research",
            cards: &[TemplateCard {
                title: "Read three existing solutions",
                description: "Note what they do well and what is missing.",
                labels: &["Report"],
            }],
        },
        TemplateList {
            name: "Building",
            cards: &[TemplateCard {
                title: "First working version",
                description: "",
                labels: &["Code", "Due soon"],
            }],
        },
        TemplateList {
            name: "Review",
            cards: &[TemplateCard {
                title: "Proofread the specification",
                description: "",
                labels: &["Report"],
            }],
        },
        TemplateList {
            name: "Delivered",
            cards: &[TemplateCard {
                title: "Slides for the final defense",
                description: "",
                labels: &["Presentation"],
            }],
        },
    ],
};
