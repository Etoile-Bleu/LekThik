use super::types::{BoardTemplate, TemplateCard, TemplateCategory, TemplateLabel, TemplateList};
use crate::boards::{LabelColor, Priority};

pub static SPRINT_PLANNING: BoardTemplate = BoardTemplate {
    id: "sprint-planning",
    name: "Sprint planning",
    description: "Run a two week sprint from backlog to done, with bugs, features and chores told apart.",
    category: TemplateCategory::Engineering,
    labels: &[
        TemplateLabel {
            name: "Urgent",
            color: LabelColor::Red,
            priority: Priority::Urgent,
        },
        TemplateLabel {
            name: "High",
            color: LabelColor::Orange,
            priority: Priority::High,
        },
        TemplateLabel {
            name: "Medium",
            color: LabelColor::Amber,
            priority: Priority::Medium,
        },
        TemplateLabel {
            name: "Low",
            color: LabelColor::Blue,
            priority: Priority::Low,
        },
        TemplateLabel {
            name: "Bug",
            color: LabelColor::Pink,
            priority: Priority::Unset,
        },
        TemplateLabel {
            name: "Feature",
            color: LabelColor::Teal,
            priority: Priority::Unset,
        },
        TemplateLabel {
            name: "Chore",
            color: LabelColor::Slate,
            priority: Priority::Unset,
        },
    ],
    lists: &[
        TemplateList {
            name: "Backlog",
            cards: &[
                TemplateCard {
                    title: "Rate limit the public sign up endpoint",
                    description: "Cap sign ups per address and per hour, and answer 429 with a retry hint.",
                    labels: &["Feature", "Medium"],
                },
                TemplateCard {
                    title: "Add dark mode tokens to the design system",
                    description: "",
                    labels: &["Feature", "Low"],
                },
            ],
        },
        TemplateList {
            name: "Sprint backlog",
            cards: &[
                TemplateCard {
                    title: "Cards keep the wrong order after a move",
                    description: "Reproduce with two lists and three cards, then lock it in with a regression test.",
                    labels: &["Bug", "High"],
                },
                TemplateCard {
                    title: "Upgrade the database driver",
                    description: "",
                    labels: &["Chore", "Medium"],
                },
            ],
        },
        TemplateList {
            name: "In progress",
            cards: &[TemplateCard {
                title: "Checkout page is slow on 3G",
                description: "Profile the bundle first, then lazy load the payment form.",
                labels: &["Bug", "Urgent"],
            }],
        },
        TemplateList {
            name: "In review",
            cards: &[TemplateCard {
                title: "Reword the email verification message",
                description: "",
                labels: &["Chore", "Low"],
            }],
        },
        TemplateList {
            name: "Done",
            cards: &[TemplateCard {
                title: "Set up continuous integration",
                description: "",
                labels: &["Chore"],
            }],
        },
    ],
};

pub static BUG_TRACKER: BoardTemplate = BoardTemplate {
    id: "bug-tracker",
    name: "Bug tracker",
    description: "Follow every defect from the first report to a verified fix, ranked by severity.",
    category: TemplateCategory::Engineering,
    labels: &[
        TemplateLabel {
            name: "Critical",
            color: LabelColor::Red,
            priority: Priority::Urgent,
        },
        TemplateLabel {
            name: "Major",
            color: LabelColor::Orange,
            priority: Priority::High,
        },
        TemplateLabel {
            name: "Minor",
            color: LabelColor::Amber,
            priority: Priority::Medium,
        },
        TemplateLabel {
            name: "Cosmetic",
            color: LabelColor::Blue,
            priority: Priority::Low,
        },
        TemplateLabel {
            name: "Regression",
            color: LabelColor::Violet,
            priority: Priority::Unset,
        },
        TemplateLabel {
            name: "Needs info",
            color: LabelColor::Slate,
            priority: Priority::Unset,
        },
    ],
    lists: &[
        TemplateList {
            name: "Reported",
            cards: &[
                TemplateCard {
                    title: "Login button does nothing on Safari 16",
                    description: "Reported by support. Ask for the console output and the exact version.",
                    labels: &["Needs info", "Major"],
                },
                TemplateCard {
                    title: "Footer link color is too light",
                    description: "",
                    labels: &["Cosmetic"],
                },
            ],
        },
        TemplateList {
            name: "Triaged",
            cards: &[TemplateCard {
                title: "Export drops rows with accented names",
                description: "Likely an encoding problem in the CSV writer.",
                labels: &["Major"],
            }],
        },
        TemplateList {
            name: "Fixing",
            cards: &[TemplateCard {
                title: "Payments fail when the cart has more than 20 items",
                description: "Started after last Thursday's release.",
                labels: &["Critical", "Regression"],
            }],
        },
        TemplateList {
            name: "Verifying",
            cards: &[TemplateCard {
                title: "Date picker shows the previous month",
                description: "",
                labels: &["Minor"],
            }],
        },
        TemplateList {
            name: "Closed",
            cards: &[],
        },
    ],
};
