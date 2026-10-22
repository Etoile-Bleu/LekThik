use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use domain::boards::BoardsError;

use crate::scope::repository_error;

pub(crate) fn insert_at(mut ids: Vec<Uuid>, id: Uuid, index: usize) -> Vec<Uuid> {
    let at = index.min(ids.len());
    ids.insert(at, id);
    ids
}

pub(crate) async fn renumber_lists(
    transaction: &mut Transaction<'_, Postgres>,
    ordered_ids: &[Uuid],
) -> Result<(), BoardsError> {
    sqlx::query(
        "UPDATE lists SET position = (t.ord - 1)::int \
            FROM UNNEST($1::uuid[]) WITH ORDINALITY AS t(id, ord) \
            WHERE lists.id = t.id",
    )
    .bind(ordered_ids)
    .execute(&mut **transaction)
    .await
    .map_err(repository_error)?;

    Ok(())
}

pub(crate) async fn renumber_cards(
    transaction: &mut Transaction<'_, Postgres>,
    ordered_ids: &[Uuid],
) -> Result<(), BoardsError> {
    sqlx::query(
        "UPDATE cards SET position = (t.ord - 1)::int, updated_at = now() \
            FROM UNNEST($1::uuid[]) WITH ORDINALITY AS t(id, ord) \
            WHERE cards.id = t.id",
    )
    .bind(ordered_ids)
    .execute(&mut **transaction)
    .await
    .map_err(repository_error)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inserts_at_the_requested_index() {
        let (a, b, c, moved) = (
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
            Uuid::new_v4(),
        );

        assert_eq!(insert_at(vec![a, b, c], moved, 1), vec![a, moved, b, c]);
    }

    #[test]
    fn indexes_past_the_end_append() {
        let (a, moved) = (Uuid::new_v4(), Uuid::new_v4());

        assert_eq!(insert_at(vec![a], moved, 99), vec![a, moved]);
    }

    #[test]
    fn inserting_into_an_empty_list_works() {
        let moved = Uuid::new_v4();

        assert_eq!(insert_at(Vec::new(), moved, 0), vec![moved]);
    }
}
