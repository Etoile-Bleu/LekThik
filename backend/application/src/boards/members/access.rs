use domain::boards::{BoardsError, MemberRepo, Role};
use uuid::Uuid;

/// Resolves the role of the acting user, answering `NotFound` to anybody who
/// is not a member so a workspace stays undiscoverable.
pub(crate) async fn role_of_actor(
    members: &dyn MemberRepo,
    workspace_id: Uuid,
    user_id: Uuid,
) -> Result<Role, BoardsError> {
    members
        .role_of(workspace_id, user_id)
        .await?
        .ok_or(BoardsError::NotFound)
}

pub(crate) fn parse_email(value: &str) -> Result<String, BoardsError> {
    let email = value.trim().to_lowercase();
    let valid = email.len() <= 254
        && !email.chars().any(char::is_whitespace)
        && email.split_once('@').is_some_and(|(local, domain)| {
            !local.is_empty()
                && !domain.contains('@')
                && domain.contains('.')
                && !domain.starts_with('.')
                && !domain.ends_with('.')
        });

    if valid {
        Ok(email)
    } else {
        Err(BoardsError::Invalid(
            "enter a valid email address".to_string(),
        ))
    }
}

pub(crate) fn parse_role(value: &str) -> Result<Role, BoardsError> {
    Role::parse(value).ok_or_else(|| BoardsError::Invalid("unknown role".to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalises_a_valid_email() {
        assert_eq!(
            parse_email("  Marie@Example.COM ").as_deref(),
            Ok("marie@example.com")
        );
    }

    #[test]
    fn rejects_malformed_emails() {
        for value in [
            "",
            "marie",
            "@example.com",
            "marie@",
            "a b@example.com",
            "a@b@c.com",
            "a@example",
        ] {
            assert!(parse_email(value).is_err(), "{value}");
        }
    }
}
