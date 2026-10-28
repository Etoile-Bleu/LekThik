use async_trait::async_trait;
use domain::boards::LabelColor;
use domain::boards::{
    BoardsError, CardFieldValue, Field, FieldKind, FieldOption, FieldPatch, FieldRepo, FieldValue,
    MAX_FIELDS_PER_BOARD, MAX_OPTIONS_PER_FIELD, NewField, OptionName,
};
use sqlx::postgres::PgRow;
use sqlx::{PgConnection, PgPool, Row};
use uuid::Uuid;

use crate::ordering::insert_at;
use crate::scope::{Kind, denial, repository_error};

pub struct PgFieldRepo {
    pool: PgPool,
}

impl PgFieldRepo {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

fn unique_or(error: sqlx::Error, message: &str) -> BoardsError {
    match &error {
        sqlx::Error::Database(database) if database.is_unique_violation() => {
            BoardsError::Conflict(message.to_string())
        }
        _ => repository_error(error),
    }
}

fn field_from_row(row: &PgRow) -> Result<Field, BoardsError> {
    let kind: String = row.try_get("kind").map_err(repository_error)?;
    Ok(Field {
        id: row.try_get("id").map_err(repository_error)?,
        board_id: row.try_get("board_id").map_err(repository_error)?,
        name: row.try_get("name").map_err(repository_error)?,
        kind: FieldKind::parse(&kind)?,
        position: row.try_get("position").map_err(repository_error)?,
        show_on_card: row.try_get("show_on_card").map_err(repository_error)?,
        options: Vec::new(),
    })
}

pub(crate) async fn fields_of_board(
    connection: &mut PgConnection,
    board_id: Uuid,
) -> Result<Vec<Field>, BoardsError> {
    let rows = sqlx::query(
        "SELECT id, board_id, name, kind, position, show_on_card FROM board_fields \
            WHERE board_id = $1 ORDER BY position, created_at, id",
    )
    .bind(board_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(repository_error)?;
    let mut fields = rows
        .iter()
        .map(field_from_row)
        .collect::<Result<Vec<_>, _>>()?;

    let option_rows = sqlx::query(
        "SELECT o.id, o.field_id, o.name, o.color FROM field_options o \
            JOIN board_fields f ON f.id = o.field_id WHERE f.board_id = $1 \
            ORDER BY o.position, o.created_at, o.id",
    )
    .bind(board_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(repository_error)?;
    for row in &option_rows {
        let field_id: Uuid = row.try_get("field_id").map_err(repository_error)?;
        let color: String = row.try_get("color").map_err(repository_error)?;
        if let Some(field) = fields.iter_mut().find(|field| field.id == field_id) {
            field.options.push(FieldOption {
                id: row.try_get("id").map_err(repository_error)?,
                name: row.try_get("name").map_err(repository_error)?,
                color: LabelColor::parse(&color)?,
            });
        }
    }
    Ok(fields)
}

pub(crate) async fn values_of_board(
    connection: &mut PgConnection,
    board_id: Uuid,
) -> Result<Vec<CardFieldValue>, BoardsError> {
    let rows = sqlx::query(
        "SELECT v.card_id, v.field_id, f.kind, v.text_value, v.number_value::text AS number_value, \
            v.date_value::text AS date_value, v.bool_value, v.option_id \
            FROM card_field_values v JOIN board_fields f ON f.id = v.field_id \
            WHERE f.board_id = $1 ORDER BY v.card_id, f.position, f.id",
    )
    .bind(board_id)
    .fetch_all(&mut *connection)
    .await
    .map_err(repository_error)?;

    let mut values = Vec::with_capacity(rows.len());
    for row in &rows {
        let kind: String = row.try_get("kind").map_err(repository_error)?;
        let text: Option<String> = row.try_get("text_value").map_err(repository_error)?;
        let number: Option<String> = row.try_get("number_value").map_err(repository_error)?;
        let date: Option<String> = row.try_get("date_value").map_err(repository_error)?;
        let checked: Option<bool> = row.try_get("bool_value").map_err(repository_error)?;
        let option: Option<Uuid> = row.try_get("option_id").map_err(repository_error)?;
        let value = match (
            FieldKind::parse(&kind)?,
            text,
            number,
            date,
            checked,
            option,
        ) {
            (FieldKind::Text | FieldKind::Url, Some(text), ..) => FieldValue::Text(text),
            (FieldKind::Number, _, Some(number), ..) => FieldValue::Number(number),
            (FieldKind::Date, _, _, Some(date), ..) => FieldValue::Date(date),
            (FieldKind::Checkbox, _, _, _, Some(checked), _) => FieldValue::Checkbox(checked),
            (FieldKind::Select, _, _, _, _, Some(option)) => FieldValue::Option(option),
            _ => continue,
        };
        values.push(CardFieldValue {
            card_id: row.try_get("card_id").map_err(repository_error)?,
            field_id: row.try_get("field_id").map_err(repository_error)?,
            value,
        });
    }
    Ok(values)
}

async fn lock_board_as_admin(
    pool: &PgPool,
    connection: &mut PgConnection,
    user_id: Uuid,
    board_id: Uuid,
) -> Result<(), BoardsError> {
    let locked = sqlx::query(concat!(
        "SELECT b.id FROM ",
        owned_board!(),
        " WHERE b.id = $1 AND ",
        admin_of!("$2"),
        " FOR UPDATE OF b"
    ))
    .bind(board_id)
    .bind(user_id)
    .fetch_optional(&mut *connection)
    .await
    .map_err(repository_error)?;
    if locked.is_none() {
        return Err(denial(pool, Kind::Board, user_id, board_id).await);
    }
    Ok(())
}

async fn one_field(
    connection: &mut PgConnection,
    board_id: Uuid,
    field_id: Uuid,
) -> Result<Field, BoardsError> {
    fields_of_board(connection, board_id)
        .await?
        .into_iter()
        .find(|field| field.id == field_id)
        .ok_or(BoardsError::NotFound)
}

#[async_trait]
impl FieldRepo for PgFieldRepo {
    async fn create(
        &self,
        user_id: Uuid,
        board_id: Uuid,
        field: NewField,
    ) -> Result<Field, BoardsError> {
        if field.kind != FieldKind::Select && !field.options.is_empty() {
            return Err(BoardsError::Invalid(
                "only a field with choices can have options".to_string(),
            ));
        }
        if field.options.len() as i64 > MAX_OPTIONS_PER_FIELD {
            return Err(BoardsError::LimitReached("options"));
        }

        let mut transaction = self.pool.begin().await.map_err(repository_error)?;
        lock_board_as_admin(&self.pool, &mut transaction, user_id, board_id).await?;

        let existing: i64 =
            sqlx::query_scalar("SELECT count(*) FROM board_fields WHERE board_id = $1")
                .bind(board_id)
                .fetch_one(&mut *transaction)
                .await
                .map_err(repository_error)?;
        if existing >= MAX_FIELDS_PER_BOARD {
            return Err(BoardsError::LimitReached("fields"));
        }

        let field_id: Uuid = sqlx::query_scalar(
            "INSERT INTO board_fields (board_id, name, kind, show_on_card, position) \
                VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(position), -1) + 1 FROM board_fields WHERE board_id = $1)) \
                RETURNING id",
        )
        .bind(board_id)
        .bind(field.name.as_str())
        .bind(field.kind.as_str())
        .bind(field.show_on_card)
        .fetch_one(&mut *transaction)
        .await
        .map_err(|error| unique_or(error, "a field with that name already exists"))?;

        for (position, (name, color)) in field.options.iter().enumerate() {
            sqlx::query(
                "INSERT INTO field_options (field_id, name, color, position) VALUES ($1, $2, $3, $4)",
            )
            .bind(field_id)
            .bind(name.as_str())
            .bind(color.as_str())
            .bind(position as i32)
            .execute(&mut *transaction)
            .await
            .map_err(|error| unique_or(error, "two choices have the same name"))?;
        }

        let created = one_field(&mut transaction, board_id, field_id).await?;
        transaction.commit().await.map_err(repository_error)?;
        Ok(created)
    }

    async fn update(
        &self,
        user_id: Uuid,
        board_id: Uuid,
        field_id: Uuid,
        patch: FieldPatch,
    ) -> Result<Field, BoardsError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;
        lock_board_as_admin(&self.pool, &mut transaction, user_id, board_id).await?;

        let result = sqlx::query(
            "UPDATE board_fields SET name = COALESCE($3, name), show_on_card = COALESCE($4, show_on_card) \
                WHERE id = $1 AND board_id = $2",
        )
        .bind(field_id)
        .bind(board_id)
        .bind(patch.name.as_ref().map(|name| name.as_str()))
        .bind(patch.show_on_card)
        .execute(&mut *transaction)
        .await
        .map_err(|error| unique_or(error, "a field with that name already exists"))?;
        if result.rows_affected() == 0 {
            return Err(BoardsError::NotFound);
        }

        if let Some(index) = patch.position {
            let others: Vec<Uuid> = sqlx::query_scalar(
                "SELECT id FROM board_fields WHERE board_id = $1 AND id <> $2 \
                    ORDER BY position, created_at, id",
            )
            .bind(board_id)
            .bind(field_id)
            .fetch_all(&mut *transaction)
            .await
            .map_err(repository_error)?;
            let ordered = insert_at(others, field_id, index);
            sqlx::query(
                "UPDATE board_fields SET position = (t.ord - 1)::int \
                    FROM UNNEST($1::uuid[]) WITH ORDINALITY AS t(id, ord) WHERE board_fields.id = t.id",
            )
            .bind(&ordered)
            .execute(&mut *transaction)
            .await
            .map_err(repository_error)?;
        }

        let updated = one_field(&mut transaction, board_id, field_id).await?;
        transaction.commit().await.map_err(repository_error)?;
        Ok(updated)
    }

    async fn delete(
        &self,
        user_id: Uuid,
        board_id: Uuid,
        field_id: Uuid,
    ) -> Result<(), BoardsError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;
        lock_board_as_admin(&self.pool, &mut transaction, user_id, board_id).await?;

        let result = sqlx::query("DELETE FROM board_fields WHERE id = $1 AND board_id = $2")
            .bind(field_id)
            .bind(board_id)
            .execute(&mut *transaction)
            .await
            .map_err(repository_error)?;
        if result.rows_affected() == 0 {
            return Err(BoardsError::NotFound);
        }
        transaction.commit().await.map_err(repository_error)?;
        Ok(())
    }

    async fn add_option(
        &self,
        user_id: Uuid,
        board_id: Uuid,
        field_id: Uuid,
        name: OptionName,
        color: LabelColor,
    ) -> Result<Field, BoardsError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;
        lock_board_as_admin(&self.pool, &mut transaction, user_id, board_id).await?;

        let field = one_field(&mut transaction, board_id, field_id).await?;
        if field.kind != FieldKind::Select {
            return Err(BoardsError::Invalid(
                "only a field with choices can have options".to_string(),
            ));
        }
        if field.options.len() as i64 >= MAX_OPTIONS_PER_FIELD {
            return Err(BoardsError::LimitReached("options"));
        }

        sqlx::query(
            "INSERT INTO field_options (field_id, name, color, position) VALUES ($1, $2, $3, \
                (SELECT COALESCE(MAX(position), -1) + 1 FROM field_options WHERE field_id = $1))",
        )
        .bind(field_id)
        .bind(name.as_str())
        .bind(color.as_str())
        .execute(&mut *transaction)
        .await
        .map_err(|error| unique_or(error, "two choices have the same name"))?;

        let updated = one_field(&mut transaction, board_id, field_id).await?;
        transaction.commit().await.map_err(repository_error)?;
        Ok(updated)
    }

    async fn update_option(
        &self,
        user_id: Uuid,
        board_id: Uuid,
        field_id: Uuid,
        option_id: Uuid,
        name: Option<OptionName>,
        color: Option<LabelColor>,
    ) -> Result<Field, BoardsError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;
        lock_board_as_admin(&self.pool, &mut transaction, user_id, board_id).await?;
        one_field(&mut transaction, board_id, field_id).await?;

        let result = sqlx::query(
            "UPDATE field_options SET name = COALESCE($3, name), color = COALESCE($4, color) \
                WHERE id = $1 AND field_id = $2",
        )
        .bind(option_id)
        .bind(field_id)
        .bind(name.as_ref().map(|name| name.as_str()))
        .bind(color.map(LabelColor::as_str))
        .execute(&mut *transaction)
        .await
        .map_err(|error| unique_or(error, "two choices have the same name"))?;
        if result.rows_affected() == 0 {
            return Err(BoardsError::NotFound);
        }

        let updated = one_field(&mut transaction, board_id, field_id).await?;
        transaction.commit().await.map_err(repository_error)?;
        Ok(updated)
    }

    async fn delete_option(
        &self,
        user_id: Uuid,
        board_id: Uuid,
        field_id: Uuid,
        option_id: Uuid,
    ) -> Result<Field, BoardsError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;
        lock_board_as_admin(&self.pool, &mut transaction, user_id, board_id).await?;
        one_field(&mut transaction, board_id, field_id).await?;

        let result = sqlx::query("DELETE FROM field_options WHERE id = $1 AND field_id = $2")
            .bind(option_id)
            .bind(field_id)
            .execute(&mut *transaction)
            .await
            .map_err(repository_error)?;
        if result.rows_affected() == 0 {
            return Err(BoardsError::NotFound);
        }

        let updated = one_field(&mut transaction, board_id, field_id).await?;
        transaction.commit().await.map_err(repository_error)?;
        Ok(updated)
    }

    async fn kind_of(
        &self,
        user_id: Uuid,
        card_id: Uuid,
        field_id: Uuid,
    ) -> Result<FieldKind, BoardsError> {
        let Some(board_id) = sqlx::query_scalar::<_, Uuid>(concat!(
            "SELECT b.id FROM ",
            owned_card!(),
            " WHERE c.id = $1 AND ",
            writer_of!("$2")
        ))
        .bind(card_id)
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(repository_error)?
        else {
            return Err(denial(&self.pool, Kind::Card, user_id, card_id).await);
        };

        let kind: String =
            sqlx::query_scalar("SELECT kind FROM board_fields WHERE id = $1 AND board_id = $2")
                .bind(field_id)
                .bind(board_id)
                .fetch_optional(&self.pool)
                .await
                .map_err(repository_error)?
                .ok_or(BoardsError::NotFound)?;
        FieldKind::parse(&kind)
    }

    async fn set_value(
        &self,
        user_id: Uuid,
        card_id: Uuid,
        field_id: Uuid,
        value: Option<FieldValue>,
    ) -> Result<Option<FieldValue>, BoardsError> {
        let mut transaction = self.pool.begin().await.map_err(repository_error)?;

        let Some(board_id) = sqlx::query_scalar::<_, Uuid>(concat!(
            "SELECT b.id FROM ",
            owned_card!(),
            " WHERE c.id = $1 AND ",
            writer_of!("$2"),
            " FOR UPDATE OF c"
        ))
        .bind(card_id)
        .bind(user_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(repository_error)?
        else {
            return Err(denial(&self.pool, Kind::Card, user_id, card_id).await);
        };

        let kind: String =
            sqlx::query_scalar("SELECT kind FROM board_fields WHERE id = $1 AND board_id = $2")
                .bind(field_id)
                .bind(board_id)
                .fetch_optional(&mut *transaction)
                .await
                .map_err(repository_error)?
                .ok_or(BoardsError::NotFound)?;
        let kind = FieldKind::parse(&kind)?;

        let Some(value) = value else {
            sqlx::query("DELETE FROM card_field_values WHERE card_id = $1 AND field_id = $2")
                .bind(card_id)
                .bind(field_id)
                .execute(&mut *transaction)
                .await
                .map_err(repository_error)?;
            transaction.commit().await.map_err(repository_error)?;
            return Ok(None);
        };

        let fits = matches!(
            (kind, &value),
            (FieldKind::Text | FieldKind::Url, FieldValue::Text(_))
                | (FieldKind::Number, FieldValue::Number(_))
                | (FieldKind::Date, FieldValue::Date(_))
                | (FieldKind::Checkbox, FieldValue::Checkbox(_))
                | (FieldKind::Select, FieldValue::Option(_))
        );
        if !fits {
            return Err(BoardsError::Invalid(
                "that value does not fit this field".to_string(),
            ));
        }

        let (mut text, mut number, mut date, mut checked, mut option) = (
            None::<String>,
            None::<String>,
            None::<String>,
            None::<bool>,
            None::<Uuid>,
        );
        match &value {
            FieldValue::Text(found) => text = Some(found.clone()),
            FieldValue::Number(found) => number = Some(found.clone()),
            FieldValue::Date(found) => date = Some(found.clone()),
            FieldValue::Checkbox(found) => checked = Some(*found),
            FieldValue::Option(found) => option = Some(*found),
        }

        if let Some(choice) = option {
            let belongs: Option<i32> =
                sqlx::query_scalar("SELECT 1 FROM field_options WHERE id = $1 AND field_id = $2")
                    .bind(choice)
                    .bind(field_id)
                    .fetch_optional(&mut *transaction)
                    .await
                    .map_err(repository_error)?;
            if belongs.is_none() {
                return Err(BoardsError::Invalid(
                    "that is not a choice of this field".to_string(),
                ));
            }
        }

        sqlx::query(
            "INSERT INTO card_field_values \
                (card_id, field_id, text_value, number_value, date_value, bool_value, option_id) \
                VALUES ($1, $2, $3, $4::numeric, $5::date, $6, $7) \
                ON CONFLICT (card_id, field_id) DO UPDATE SET text_value = EXCLUDED.text_value, \
                number_value = EXCLUDED.number_value, date_value = EXCLUDED.date_value, \
                bool_value = EXCLUDED.bool_value, option_id = EXCLUDED.option_id",
        )
        .bind(card_id)
        .bind(field_id)
        .bind(&text)
        .bind(&number)
        .bind(&date)
        .bind(checked)
        .bind(option)
        .execute(&mut *transaction)
        .await
        .map_err(repository_error)?;

        transaction.commit().await.map_err(repository_error)?;
        Ok(Some(value))
    }
}
