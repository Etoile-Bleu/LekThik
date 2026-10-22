use super::types::{BoardTemplate, TemplateCard, TemplateCategory, TemplateLabel, TemplateList};
use crate::boards::{LabelColor, Priority};

pub static WEEKLY_PLANNER: BoardTemplate = BoardTemplate {
    id: "weekly-planner",
    name: "Weekly planner",
    description: "Empty your head into an inbox, then pick what truly belongs to today and to this week.",
    category: TemplateCategory::Personal,
    labels: &[
        TemplateLabel {
            name: "Today",
            color: LabelColor::Red,
            priority: Priority::Urgent,
        },
        TemplateLabel {
            name: "Deep work",
            color: LabelColor::Violet,
            priority: Priority::Unset,
        },
        TemplateLabel {
            name: "Errand",
            color: LabelColor::Slate,
            priority: Priority::Unset,
        },
        TemplateLabel {
            name: "Admin",
            color: LabelColor::Amber,
            priority: Priority::Unset,
        },
    ],
    lists: &[
        TemplateList {
            name: "Inbox",
            cards: &[
                TemplateCard {
                    title: "Renew the library card",
                    description: "",
                    labels: &["Admin"],
                },
                TemplateCard {
                    title: "Ideas for the weekend trip",
                    description: "",
                    labels: &[],
                },
            ],
        },
        TemplateList {
            name: "Today",
            cards: &[TemplateCard {
                title: "Two hours on the report introduction",
                description: "Phone away, one tab only.",
                labels: &["Deep work", "Today"],
            }],
        },
        TemplateList {
            name: "This week",
            cards: &[
                TemplateCard {
                    title: "Groceries",
                    description: "",
                    labels: &["Errand"],
                },
                TemplateCard {
                    title: "Send the invoice",
                    description: "",
                    labels: &["Admin"],
                },
            ],
        },
        TemplateList {
            name: "Waiting for",
            cards: &[TemplateCard {
                title: "Reply from the landlord about the repair",
                description: "Follow up on Thursday if nothing arrives.",
                labels: &[],
            }],
        },
        TemplateList {
            name: "Done",
            cards: &[],
        },
    ],
};

pub static EVENT_PLANNING: BoardTemplate = BoardTemplate {
    id: "event-planning",
    name: "Event planning",
    description: "Organize a gathering from the first idea to the thank you messages, without losing a detail.",
    category: TemplateCategory::Personal,
    labels: &[
        TemplateLabel {
            name: "Book now",
            color: LabelColor::Red,
            priority: Priority::Urgent,
        },
        TemplateLabel {
            name: "Budget",
            color: LabelColor::Green,
            priority: Priority::Unset,
        },
        TemplateLabel {
            name: "Guests",
            color: LabelColor::Blue,
            priority: Priority::Unset,
        },
        TemplateLabel {
            name: "Food",
            color: LabelColor::Orange,
            priority: Priority::Unset,
        },
    ],
    lists: &[
        TemplateList {
            name: "Ideas",
            cards: &[TemplateCard {
                title: "Pick a theme and a date",
                description: "",
                labels: &[],
            }],
        },
        TemplateList {
            name: "Venue and logistics",
            cards: &[
                TemplateCard {
                    title: "Book the venue",
                    description: "Visit two places before deciding.",
                    labels: &["Book now", "Budget"],
                },
                TemplateCard {
                    title: "Sound system and chairs",
                    description: "",
                    labels: &[],
                },
            ],
        },
        TemplateList {
            name: "Guests and invitations",
            cards: &[
                TemplateCard {
                    title: "Write the guest list",
                    description: "",
                    labels: &["Guests"],
                },
                TemplateCard {
                    title: "Send invitations three weeks ahead",
                    description: "",
                    labels: &["Guests"],
                },
            ],
        },
        TemplateList {
            name: "Day-of checklist",
            cards: &[TemplateCard {
                title: "Food delivery at 17:00",
                description: "",
                labels: &["Food"],
            }],
        },
        TemplateList {
            name: "Wrap-up",
            cards: &[],
        },
    ],
};
