use super::types::WorkspaceTemplate;

pub static WORKSPACE_TEMPLATES: [WorkspaceTemplate; 4] = [
    WorkspaceTemplate {
        id: "software-team",
        name: "Software team",
        description: "Plan sprints, track bugs and share the roadmap with the rest of the company.",
        board_ids: &["sprint-planning", "bug-tracker", "product-roadmap"],
    },
    WorkspaceTemplate {
        id: "marketing-team",
        name: "Marketing team",
        description: "A content calendar for the week to week work and a campaign plan for the big launches.",
        board_ids: &["content-calendar", "campaign-plan"],
    },
    WorkspaceTemplate {
        id: "people-and-operations",
        name: "People and operations",
        description: "Hire with a clear pipeline, plan the team week and organize the next event.",
        board_ids: &["hiring-pipeline", "weekly-planner", "event-planning"],
    },
    WorkspaceTemplate {
        id: "student-life",
        name: "Student life",
        description: "A board for the group project and one to keep the week under control.",
        board_ids: &["school-project", "weekly-planner"],
    },
];
