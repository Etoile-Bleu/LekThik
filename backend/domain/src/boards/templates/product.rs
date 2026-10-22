use super::types::{BoardTemplate, TemplateCard, TemplateCategory, TemplateLabel, TemplateList};
use crate::boards::{LabelColor, Priority};

pub static PRODUCT_ROADMAP: BoardTemplate = BoardTemplate {
    id: "product-roadmap",
    name: "Product roadmap",
    description: "Share what is happening now, what comes next and what waits, ranked by how much it matters.",
    category: TemplateCategory::Product,
    labels: &[
        TemplateLabel {
            name: "Must have",
            color: LabelColor::Red,
            priority: Priority::Urgent,
        },
        TemplateLabel {
            name: "Should have",
            color: LabelColor::Amber,
            priority: Priority::Medium,
        },
        TemplateLabel {
            name: "Nice to have",
            color: LabelColor::Blue,
            priority: Priority::Low,
        },
        TemplateLabel {
            name: "Growth",
            color: LabelColor::Teal,
            priority: Priority::Unset,
        },
        TemplateLabel {
            name: "Reliability",
            color: LabelColor::Slate,
            priority: Priority::Unset,
        },
        TemplateLabel {
            name: "Design",
            color: LabelColor::Pink,
            priority: Priority::Unset,
        },
    ],
    lists: &[
        TemplateList {
            name: "Now",
            cards: &[
                TemplateCard {
                    title: "Invite teammates by email",
                    description: "Smallest version: one link per workspace, valid for seven days.",
                    labels: &["Must have", "Growth"],
                },
                TemplateCard {
                    title: "Faster board loading",
                    description: "Target: first cards visible in under one second on a mid range phone.",
                    labels: &["Should have", "Reliability"],
                },
            ],
        },
        TemplateList {
            name: "Next",
            cards: &[
                TemplateCard {
                    title: "Due dates on cards",
                    description: "",
                    labels: &["Should have"],
                },
                TemplateCard {
                    title: "Keyboard shortcuts cheat sheet",
                    description: "",
                    labels: &["Nice to have", "Design"],
                },
            ],
        },
        TemplateList {
            name: "Later",
            cards: &[
                TemplateCard {
                    title: "Calendar view",
                    description: "Wait for the due dates feature to settle first.",
                    labels: &["Nice to have"],
                },
                TemplateCard {
                    title: "Public read only boards",
                    description: "",
                    labels: &["Growth"],
                },
            ],
        },
        TemplateList {
            name: "Shipped",
            cards: &[TemplateCard {
                title: "Priority labels",
                description: "",
                labels: &["Design"],
            }],
        },
    ],
};
