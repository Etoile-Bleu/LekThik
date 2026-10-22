mod engineering;
mod marketing;
mod people;
mod personal;
mod product;
mod school;
mod types;
mod workspaces;

pub use types::{
    BoardTemplate, TemplateCard, TemplateCategory, TemplateLabel, TemplateList, WorkspaceTemplate,
};

static BOARD_TEMPLATES: [&BoardTemplate; 9] = [
    &engineering::SPRINT_PLANNING,
    &engineering::BUG_TRACKER,
    &product::PRODUCT_ROADMAP,
    &marketing::CONTENT_CALENDAR,
    &marketing::CAMPAIGN_PLAN,
    &people::HIRING_PIPELINE,
    &personal::WEEKLY_PLANNER,
    &personal::EVENT_PLANNING,
    &school::SCHOOL_PROJECT,
];

pub fn board_templates() -> &'static [&'static BoardTemplate] {
    &BOARD_TEMPLATES
}

pub fn board_template(id: &str) -> Option<&'static BoardTemplate> {
    BOARD_TEMPLATES
        .iter()
        .copied()
        .find(|template| template.id == id)
}

pub fn workspace_templates() -> &'static [WorkspaceTemplate] {
    &workspaces::WORKSPACE_TEMPLATES
}

pub fn workspace_template(id: &str) -> Option<&'static WorkspaceTemplate> {
    workspaces::WORKSPACE_TEMPLATES
        .iter()
        .find(|template| template.id == id)
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;
    use crate::boards::{
        DESCRIPTION_MAX_CHARS, Description, MAX_BOARDS_PER_WORKSPACE, MAX_CARDS_PER_LIST,
        MAX_LABELS_PER_BOARD, MAX_LISTS_PER_BOARD, Title,
    };

    #[test]
    fn board_template_ids_are_unique_and_resolvable() {
        let mut seen = HashSet::new();
        for template in board_templates() {
            assert!(seen.insert(template.id), "duplicate id {}", template.id);
            assert_eq!(
                board_template(template.id).map(|found| found.id),
                Some(template.id)
            );
        }
        assert!(board_template("does-not-exist").is_none());
    }

    #[test]
    fn every_name_and_text_passes_the_same_validation_as_user_input() {
        for template in board_templates() {
            assert!(Title::parse(template.name).is_ok(), "{}", template.name);
            assert!(
                template.description.chars().count() <= DESCRIPTION_MAX_CHARS,
                "{}",
                template.id
            );
            for label in template.labels {
                assert!(
                    Title::parse_label_name(label.name).is_ok(),
                    "{}",
                    label.name
                );
            }
            for list in template.lists {
                assert!(Title::parse(list.name).is_ok(), "{}", list.name);
                for card in list.cards {
                    assert!(Title::parse(card.title).is_ok(), "{}", card.title);
                    assert!(
                        Description::parse(card.description).is_ok(),
                        "{}",
                        card.title
                    );
                }
            }
        }
    }

    #[test]
    fn templates_stay_within_the_per_board_limits() {
        for template in board_templates() {
            assert!(
                template.labels.len() as i64 <= MAX_LABELS_PER_BOARD,
                "{}",
                template.id
            );
            assert!(
                template.lists.len() as i64 <= MAX_LISTS_PER_BOARD,
                "{}",
                template.id
            );
            for list in template.lists {
                assert!(
                    list.cards.len() as i64 <= MAX_CARDS_PER_LIST,
                    "{}",
                    list.name
                );
            }
        }
    }

    #[test]
    fn card_labels_refer_to_labels_the_template_defines_exactly_once() {
        for template in board_templates() {
            let names: Vec<&str> = template.labels.iter().map(|label| label.name).collect();
            let unique: HashSet<&str> = names.iter().copied().collect();
            assert_eq!(
                names.len(),
                unique.len(),
                "duplicate label in {}",
                template.id
            );

            for list in template.lists {
                for card in list.cards {
                    let mut applied = HashSet::new();
                    for label in card.labels {
                        assert!(
                            names.contains(label),
                            "{} uses unknown label {label}",
                            card.title
                        );
                        assert!(applied.insert(label), "{} repeats {label}", card.title);
                    }
                }
            }
        }
    }

    #[test]
    fn every_template_has_lists_and_a_description() {
        for template in board_templates() {
            assert!(!template.lists.is_empty(), "{}", template.id);
            assert!(!template.description.is_empty(), "{}", template.id);
        }
    }

    #[test]
    fn workspace_templates_only_reference_existing_boards() {
        let mut seen = HashSet::new();
        for template in workspace_templates() {
            assert!(seen.insert(template.id), "duplicate id {}", template.id);
            assert!(Title::parse(template.name).is_ok());
            assert!(!template.board_ids.is_empty());
            assert!(template.board_ids.len() as i64 <= MAX_BOARDS_PER_WORKSPACE);
            for board_id in template.board_ids {
                assert!(
                    board_template(board_id).is_some(),
                    "{} -> {board_id}",
                    template.id
                );
            }
            assert_eq!(
                workspace_template(template.id).map(|found| found.id),
                Some(template.id)
            );
        }
        assert!(workspace_template("does-not-exist").is_none());
    }
}
