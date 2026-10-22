use super::types::{BoardTemplate, TemplateCard, TemplateCategory, TemplateLabel, TemplateList};
use crate::boards::{LabelColor, Priority};

pub static CONTENT_CALENDAR: BoardTemplate = BoardTemplate {
    id: "content-calendar",
    name: "Content calendar",
    description: "Take every article, newsletter and post from a rough idea to published, channel by channel.",
    category: TemplateCategory::Marketing,
    labels: &[
        TemplateLabel {
            name: "Due this week",
            color: LabelColor::Red,
            priority: Priority::Urgent,
        },
        TemplateLabel {
            name: "Blog",
            color: LabelColor::Teal,
            priority: Priority::Unset,
        },
        TemplateLabel {
            name: "Newsletter",
            color: LabelColor::Violet,
            priority: Priority::Unset,
        },
        TemplateLabel {
            name: "Social",
            color: LabelColor::Pink,
            priority: Priority::Unset,
        },
        TemplateLabel {
            name: "Video",
            color: LabelColor::Orange,
            priority: Priority::Unset,
        },
    ],
    lists: &[
        TemplateList {
            name: "Ideas",
            cards: &[
                TemplateCard {
                    title: "Five mistakes when planning a first sprint",
                    description: "Angle: practical, one short story per mistake.",
                    labels: &["Blog"],
                },
                TemplateCard {
                    title: "Behind the scenes of a release day",
                    description: "",
                    labels: &["Video"],
                },
            ],
        },
        TemplateList {
            name: "Writing",
            cards: &[TemplateCard {
                title: "Spring product update",
                description: "Three highlights, one screenshot each, and a clear link to try them.",
                labels: &["Newsletter", "Due this week"],
            }],
        },
        TemplateList {
            name: "In review",
            cards: &[TemplateCard {
                title: "How a small team ships every week",
                description: "",
                labels: &["Blog"],
            }],
        },
        TemplateList {
            name: "Scheduled",
            cards: &[TemplateCard {
                title: "Launch day thread",
                description: "Post at 9:00 local time, then answer replies for an hour.",
                labels: &["Social"],
            }],
        },
        TemplateList {
            name: "Published",
            cards: &[],
        },
    ],
};

pub static CAMPAIGN_PLAN: BoardTemplate = BoardTemplate {
    id: "campaign-plan",
    name: "Campaign plan",
    description: "Plan a launch from the brief to the results review, with every channel in one place.",
    category: TemplateCategory::Marketing,
    labels: &[
        TemplateLabel {
            name: "Launch day",
            color: LabelColor::Red,
            priority: Priority::Urgent,
        },
        TemplateLabel {
            name: "Paid",
            color: LabelColor::Orange,
            priority: Priority::Unset,
        },
        TemplateLabel {
            name: "Organic",
            color: LabelColor::Green,
            priority: Priority::Unset,
        },
        TemplateLabel {
            name: "Email",
            color: LabelColor::Violet,
            priority: Priority::Unset,
        },
        TemplateLabel {
            name: "Partners",
            color: LabelColor::Blue,
            priority: Priority::Unset,
        },
    ],
    lists: &[
        TemplateList {
            name: "Brief",
            cards: &[
                TemplateCard {
                    title: "Define the audience and the single goal",
                    description: "One sentence each. If it takes a paragraph, the goal is not clear yet.",
                    labels: &[],
                },
                TemplateCard {
                    title: "Set the budget and the dates",
                    description: "",
                    labels: &[],
                },
            ],
        },
        TemplateList {
            name: "Planning",
            cards: &[
                TemplateCard {
                    title: "Pick the channels",
                    description: "",
                    labels: &["Paid", "Organic", "Email"],
                },
                TemplateCard {
                    title: "Ask two partners to share the launch",
                    description: "",
                    labels: &["Partners"],
                },
            ],
        },
        TemplateList {
            name: "In production",
            cards: &[TemplateCard {
                title: "Launch email sequence, three messages",
                description: "",
                labels: &["Email"],
            }],
        },
        TemplateList {
            name: "Live",
            cards: &[TemplateCard {
                title: "Announcement and first day monitoring",
                description: "",
                labels: &["Launch day"],
            }],
        },
        TemplateList {
            name: "Results",
            cards: &[],
        },
    ],
};
