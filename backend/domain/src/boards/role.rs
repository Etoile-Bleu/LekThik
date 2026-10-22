#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Role {
    Reader,
    Writer,
    Admin,
    Owner,
}

impl Role {
    pub fn as_str(self) -> &'static str {
        match self {
            Role::Reader => "reader",
            Role::Writer => "writer",
            Role::Admin => "admin",
            Role::Owner => "owner",
        }
    }

    pub fn parse(value: &str) -> Option<Role> {
        match value {
            "reader" => Some(Role::Reader),
            "writer" => Some(Role::Writer),
            "admin" => Some(Role::Admin),
            "owner" => Some(Role::Owner),
            _ => None,
        }
    }

    pub fn can_edit_content(self) -> bool {
        self >= Role::Writer
    }

    pub fn can_manage(self) -> bool {
        self >= Role::Admin
    }

    pub fn can_delete_workspace(self) -> bool {
        self == Role::Owner
    }

    /// A member can act on another member only when they strictly outrank
    /// them, so an admin never touches another admin or the owner.
    pub fn can_manage_member(self, target: Role) -> bool {
        self.can_manage() && self > target
    }

    /// The owner role is never handed out, and nobody grants a role equal to
    /// or above their own.
    pub fn can_assign(self, role: Role) -> bool {
        self.can_manage() && role != Role::Owner && role < self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roles_are_ordered_from_reader_to_owner() {
        assert!(Role::Reader < Role::Writer);
        assert!(Role::Writer < Role::Admin);
        assert!(Role::Admin < Role::Owner);
    }

    #[test]
    fn only_writers_and_above_edit_content() {
        assert!(!Role::Reader.can_edit_content());
        assert!(Role::Writer.can_edit_content());
        assert!(Role::Admin.can_edit_content());
        assert!(Role::Owner.can_edit_content());
    }

    #[test]
    fn only_admins_and_the_owner_manage_the_workspace() {
        assert!(!Role::Writer.can_manage());
        assert!(Role::Admin.can_manage());
        assert!(Role::Owner.can_manage());
    }

    #[test]
    fn only_the_owner_deletes_the_workspace() {
        assert!(Role::Owner.can_delete_workspace());
        assert!(!Role::Admin.can_delete_workspace());
    }

    #[test]
    fn nobody_manages_an_equal_or_higher_member() {
        assert!(Role::Owner.can_manage_member(Role::Admin));
        assert!(Role::Admin.can_manage_member(Role::Writer));
        assert!(!Role::Admin.can_manage_member(Role::Admin));
        assert!(!Role::Admin.can_manage_member(Role::Owner));
        assert!(!Role::Writer.can_manage_member(Role::Reader));
    }

    #[test]
    fn nobody_assigns_the_owner_role_or_one_above_their_own() {
        assert!(Role::Owner.can_assign(Role::Admin));
        assert!(!Role::Owner.can_assign(Role::Owner));
        assert!(Role::Admin.can_assign(Role::Writer));
        assert!(!Role::Admin.can_assign(Role::Admin));
        assert!(!Role::Writer.can_assign(Role::Reader));
    }

    #[test]
    fn parses_every_role_it_prints() {
        for role in [Role::Reader, Role::Writer, Role::Admin, Role::Owner] {
            assert_eq!(Role::parse(role.as_str()), Some(role));
        }
        assert_eq!(Role::parse("root"), None);
    }
}
