use super::types::{BoardTemplate, TemplateCard, TemplateCategory, TemplateLabel, TemplateList};
use crate::boards::{LabelColor, Priority};

pub static HIRING_PIPELINE: BoardTemplate = BoardTemplate {
    id: "hiring-pipeline",
    name: "Hiring pipeline",
    description: "Follow every candidate from the first application to an offer, one role at a time.",
    category: TemplateCategory::People,
    labels: &[
        TemplateLabel {
            name: "Fast track",
            color: LabelColor::Red,
            priority: Priority::Urgent,
        },
        TemplateLabel {
            name: "Follow up",
            color: LabelColor::Amber,
            priority: Priority::Medium,
        },
        TemplateLabel {
            name: "Referral",
            color: LabelColor::Violet,
            priority: Priority::Unset,
        },
        TemplateLabel {
            name: "Remote",
            color: LabelColor::Teal,
            priority: Priority::Unset,
        },
    ],
    lists: &[
        TemplateList {
            name: "Applied",
            cards: &[
                TemplateCard {
                    title: "Frontend engineer, application 1",
                    description: "Portfolio looks strong. Check the open source work before the call.",
                    labels: &["Remote"],
                },
                TemplateCard {
                    title: "Frontend engineer, application 2",
                    description: "",
                    labels: &[],
                },
            ],
        },
        TemplateList {
            name: "Screening",
            cards: &[TemplateCard {
                title: "Product designer, application 4",
                description: "Thirty minute call booked. Share the case study brief beforehand.",
                labels: &["Referral", "Follow up"],
            }],
        },
        TemplateList {
            name: "Interview",
            cards: &[TemplateCard {
                title: "Backend engineer, application 7",
                description: "Panel with two engineers and one product manager.",
                labels: &["Fast track"],
            }],
        },
        TemplateList {
            name: "Offer",
            cards: &[],
        },
        TemplateList {
            name: "Hired",
            cards: &[],
        },
        TemplateList {
            name: "Not moving forward",
            cards: &[],
        },
    ],
};
