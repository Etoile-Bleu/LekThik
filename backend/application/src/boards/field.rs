use std::sync::Arc;

use domain::boards::{
    BoardsError, Field, FieldKind, FieldName, FieldPatch, FieldRepo, FieldValue, LabelColor,
    MAX_OPTIONS_PER_FIELD, NewField, OptionName,
};
use serde_json::Value;
use uuid::Uuid;

pub struct NewOption {
    pub name: String,
    pub color: String,
}

pub struct CreateField {
    repo: Arc<dyn FieldRepo>,
}

impl CreateField {
    pub fn new(repo: Arc<dyn FieldRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        board_id: Uuid,
        name: &str,
        kind: &str,
        options: Vec<NewOption>,
        show_on_card: bool,
    ) -> Result<Field, BoardsError> {
        let kind = FieldKind::parse(kind)?;
        if options.len() as i64 > MAX_OPTIONS_PER_FIELD {
            return Err(BoardsError::LimitReached("options"));
        }
        let options = options
            .iter()
            .map(|option| {
                Ok((
                    OptionName::parse(&option.name)?,
                    LabelColor::parse(&option.color)?,
                ))
            })
            .collect::<Result<Vec<_>, BoardsError>>()?;
        let field = NewField {
            name: FieldName::parse(name)?,
            kind,
            options,
            show_on_card,
        };
        self.repo.create(user_id, board_id, field).await
    }
}

pub struct UpdateField {
    repo: Arc<dyn FieldRepo>,
}

impl UpdateField {
    pub fn new(repo: Arc<dyn FieldRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        board_id: Uuid,
        field_id: Uuid,
        name: Option<&str>,
        show_on_card: Option<bool>,
        position: Option<usize>,
    ) -> Result<Field, BoardsError> {
        let patch = FieldPatch {
            name: name.map(FieldName::parse).transpose()?,
            show_on_card,
            position,
        };
        self.repo.update(user_id, board_id, field_id, patch).await
    }
}

pub struct DeleteField {
    repo: Arc<dyn FieldRepo>,
}

impl DeleteField {
    pub fn new(repo: Arc<dyn FieldRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        board_id: Uuid,
        field_id: Uuid,
    ) -> Result<(), BoardsError> {
        self.repo.delete(user_id, board_id, field_id).await
    }
}

pub struct AddFieldOption {
    repo: Arc<dyn FieldRepo>,
}

impl AddFieldOption {
    pub fn new(repo: Arc<dyn FieldRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        board_id: Uuid,
        field_id: Uuid,
        name: &str,
        color: &str,
    ) -> Result<Field, BoardsError> {
        self.repo
            .add_option(
                user_id,
                board_id,
                field_id,
                OptionName::parse(name)?,
                LabelColor::parse(color)?,
            )
            .await
    }
}

pub struct UpdateFieldOption {
    repo: Arc<dyn FieldRepo>,
}

impl UpdateFieldOption {
    pub fn new(repo: Arc<dyn FieldRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        board_id: Uuid,
        field_id: Uuid,
        option_id: Uuid,
        name: Option<&str>,
        color: Option<&str>,
    ) -> Result<Field, BoardsError> {
        self.repo
            .update_option(
                user_id,
                board_id,
                field_id,
                option_id,
                name.map(OptionName::parse).transpose()?,
                color.map(LabelColor::parse).transpose()?,
            )
            .await
    }
}

pub struct DeleteFieldOption {
    repo: Arc<dyn FieldRepo>,
}

impl DeleteFieldOption {
    pub fn new(repo: Arc<dyn FieldRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        board_id: Uuid,
        field_id: Uuid,
        option_id: Uuid,
    ) -> Result<Field, BoardsError> {
        self.repo
            .delete_option(user_id, board_id, field_id, option_id)
            .await
    }
}

pub struct SetCardField {
    repo: Arc<dyn FieldRepo>,
}

impl SetCardField {
    pub fn new(repo: Arc<dyn FieldRepo>) -> Self {
        Self { repo }
    }

    pub async fn execute(
        &self,
        user_id: Uuid,
        card_id: Uuid,
        field_id: Uuid,
        raw: &Value,
    ) -> Result<Option<FieldValue>, BoardsError> {
        let kind = self.repo.kind_of(user_id, card_id, field_id).await?;
        let value = FieldValue::parse(kind, raw)?;
        self.repo.set_value(user_id, card_id, field_id, value).await
    }
}

#[cfg(test)]
mod tests {
    use domain::boards::MockFieldRepo;
    use serde_json::json;

    use super::*;

    fn field(kind: FieldKind) -> Field {
        Field {
            id: Uuid::new_v4(),
            board_id: Uuid::new_v4(),
            name: "Size".to_string(),
            kind,
            position: 0,
            show_on_card: false,
            options: Vec::new(),
        }
    }

    #[tokio::test]
    async fn creates_a_field_with_checked_names_and_colours() {
        let mut repo = MockFieldRepo::new();
        repo.expect_create()
            .times(1)
            .withf(|_, _, new| {
                new.name.as_str() == "Environment"
                    && new.kind == FieldKind::Select
                    && new.options.len() == 2
                    && new.options[0].0.as_str() == "Staging"
            })
            .returning(|_, _, _| Ok(field(FieldKind::Select)));

        let created = CreateField::new(Arc::new(repo))
            .execute(
                Uuid::new_v4(),
                Uuid::new_v4(),
                "  Environment ",
                "select",
                vec![
                    NewOption {
                        name: " Staging".to_string(),
                        color: "amber".to_string(),
                    },
                    NewOption {
                        name: "Production".to_string(),
                        color: "red".to_string(),
                    },
                ],
                true,
            )
            .await
            .expect("created");

        assert_eq!(created.kind, FieldKind::Select);
    }

    #[tokio::test]
    async fn refuses_bad_input_without_asking_storage() {
        let cases: Vec<(&str, &str, Vec<NewOption>)> = vec![
            ("  ", "text", vec![]),
            ("Size", "formula", vec![]),
            (
                "Size",
                "select",
                vec![NewOption {
                    name: "A".into(),
                    color: "chartreuse".into(),
                }],
            ),
            (
                "Size",
                "select",
                vec![NewOption {
                    name: " ".into(),
                    color: "red".into(),
                }],
            ),
        ];
        for (name, kind, options) in cases {
            let result = CreateField::new(Arc::new(MockFieldRepo::new()))
                .execute(Uuid::new_v4(), Uuid::new_v4(), name, kind, options, false)
                .await;

            assert!(
                matches!(result, Err(BoardsError::Invalid(_))),
                "{name} {kind}"
            );
        }
        let too_many = (0..=MAX_OPTIONS_PER_FIELD)
            .map(|index| NewOption {
                name: format!("Option {index}"),
                color: "red".into(),
            })
            .collect();
        let result = CreateField::new(Arc::new(MockFieldRepo::new()))
            .execute(
                Uuid::new_v4(),
                Uuid::new_v4(),
                "Size",
                "select",
                too_many,
                false,
            )
            .await;
        assert_eq!(result, Err(BoardsError::LimitReached("options")));
    }

    #[tokio::test]
    async fn updates_only_what_was_sent() {
        let mut repo = MockFieldRepo::new();
        repo.expect_update()
            .times(1)
            .withf(|_, _, _, patch| {
                patch.name.as_ref().map(|name| name.as_str()) == Some("Story points")
                    && patch.show_on_card == Some(true)
                    && patch.position.is_none()
            })
            .returning(|_, _, _, _| Ok(field(FieldKind::Number)));

        UpdateField::new(Arc::new(repo))
            .execute(
                Uuid::new_v4(),
                Uuid::new_v4(),
                Uuid::new_v4(),
                Some(" Story points "),
                Some(true),
                None,
            )
            .await
            .expect("updated");
        let refused = UpdateField::new(Arc::new(MockFieldRepo::new()))
            .execute(
                Uuid::new_v4(),
                Uuid::new_v4(),
                Uuid::new_v4(),
                Some(""),
                None,
                None,
            )
            .await;
        assert!(matches!(refused, Err(BoardsError::Invalid(_))));
    }

    fn repo_of_kind(kind: FieldKind) -> MockFieldRepo {
        let mut repo = MockFieldRepo::new();
        repo.expect_kind_of().returning(move |_, _, _| Ok(kind));
        repo
    }

    #[tokio::test]
    async fn sets_a_value_parsed_for_the_kind_of_the_field() {
        let mut repo = repo_of_kind(FieldKind::Number);
        repo.expect_set_value()
            .times(1)
            .withf(|_, _, _, value| *value == Some(FieldValue::Number("2.5".to_string())))
            .returning(|_, _, _, value| Ok(value));

        let saved = SetCardField::new(Arc::new(repo))
            .execute(
                Uuid::new_v4(),
                Uuid::new_v4(),
                Uuid::new_v4(),
                &json!("2.50"),
            )
            .await
            .expect("saved");

        assert_eq!(saved, Some(FieldValue::Number("2.5".to_string())));
    }

    #[tokio::test]
    async fn clears_a_value_with_null_and_refuses_the_wrong_shape() {
        let mut repo = repo_of_kind(FieldKind::Date);
        repo.expect_set_value()
            .times(1)
            .withf(|_, _, _, value| value.is_none())
            .returning(|_, _, _, _| Ok(None));
        let cleared = SetCardField::new(Arc::new(repo))
            .execute(Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4(), &Value::Null)
            .await
            .expect("cleared");
        assert_eq!(cleared, None);

        let wrong = SetCardField::new(Arc::new(repo_of_kind(FieldKind::Checkbox)))
            .execute(
                Uuid::new_v4(),
                Uuid::new_v4(),
                Uuid::new_v4(),
                &json!("yes"),
            )
            .await;
        assert!(matches!(wrong, Err(BoardsError::Invalid(_))));
    }
}
