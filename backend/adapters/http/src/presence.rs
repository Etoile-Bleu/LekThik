use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use uuid::Uuid;

/// How long a tab stays "here" after its last sign of life. The client reports every 20 seconds,
/// so one missed report never makes someone flicker away.
pub const PRESENCE_TTL: Duration = Duration::from_secs(50);

/// The longest a tab identifier can be, the same rule as the one for live events.
pub const CLIENT_ID_MAX_LEN: usize = 64;

#[derive(Debug, Clone)]
struct Entry {
    user_id: Uuid,
    username: String,
    workspace_id: Uuid,
    board_id: Uuid,
    card_id: Option<Uuid>,
    seen: Instant,
}

/// One person on a board, however many tabs they have open.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Viewer {
    pub user_id: Uuid,
    pub username: String,
    /// The card they have open, when they have one. With several tabs, the one seen last.
    pub card_id: Option<Uuid>,
}

/// A board whose crowd just changed, so the people on it should look again.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Touched {
    pub workspace_id: Uuid,
    pub board_id: Uuid,
}

/// Who is looking at which board and card right now. It lives in memory only: nothing about it is
/// ever written to the database, it expires by itself and it is gone when the server restarts.
#[derive(Default)]
pub struct PresenceHub {
    tabs: Mutex<HashMap<String, Entry>>,
}

fn same_place(a: &Entry, b: &Entry) -> bool {
    a.user_id == b.user_id && a.board_id == b.board_id && a.card_id == b.card_id
}

impl PresenceHub {
    pub fn new() -> Self {
        Self::default()
    }

    fn tabs(&self) -> std::sync::MutexGuard<'_, HashMap<String, Entry>> {
        self.tabs
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Whether this tab is already known, so a first report can be told from the ones after it.
    pub fn knows(&self, client_id: &str, user_id: Uuid) -> bool {
        self.tabs()
            .get(client_id)
            .is_some_and(|entry| entry.user_id == user_id)
    }

    /// Records that a tab is on a board, and on a card or not. Returns the board to tell about when
    /// this changed who is where. Reports that change nothing, the heartbeat, return `None`.
    #[allow(clippy::too_many_arguments)]
    pub fn beat(
        &self,
        client_id: &str,
        user_id: Uuid,
        username: &str,
        workspace_id: Uuid,
        board_id: Uuid,
        card_id: Option<Uuid>,
        now: Instant,
    ) -> Vec<Touched> {
        let entry = Entry {
            user_id,
            username: username.to_string(),
            workspace_id,
            board_id,
            card_id,
            seen: now,
        };
        let mut tabs = self.tabs();
        let mut touched = Vec::new();
        let before = tabs.insert(client_id.to_string(), entry.clone());
        match before {
            // A tab of somebody else with the same identifier is not the same tab: it is replaced.
            Some(previous) if previous.user_id == user_id && same_place(&previous, &entry) => {}
            Some(previous) => {
                touched.push(Touched {
                    workspace_id: previous.workspace_id,
                    board_id: previous.board_id,
                });
                if previous.board_id != board_id {
                    touched.push(Touched {
                        workspace_id,
                        board_id,
                    });
                }
            }
            None => touched.push(Touched {
                workspace_id,
                board_id,
            }),
        }
        touched.dedup();
        touched
    }

    /// A tab leaves, because the page was closed or hidden. Only its own person can end it.
    pub fn leave(&self, client_id: &str, user_id: Uuid) -> Option<Touched> {
        let mut tabs = self.tabs();
        if tabs
            .get(client_id)
            .is_some_and(|entry| entry.user_id == user_id)
        {
            return tabs.remove(client_id).map(|entry| Touched {
                workspace_id: entry.workspace_id,
                board_id: entry.board_id,
            });
        }
        None
    }

    /// Forgets the tabs that stopped reporting, and says which boards that touched.
    pub fn sweep(&self, now: Instant) -> Vec<Touched> {
        let mut tabs = self.tabs();
        let gone: Vec<String> = tabs
            .iter()
            .filter(|(_, entry)| now.duration_since(entry.seen) > PRESENCE_TTL)
            .map(|(client, _)| client.clone())
            .collect();
        let mut touched = Vec::new();
        for client in gone {
            if let Some(entry) = tabs.remove(&client) {
                touched.push(Touched {
                    workspace_id: entry.workspace_id,
                    board_id: entry.board_id,
                });
            }
        }
        touched.sort_by_key(|item| (item.workspace_id, item.board_id));
        touched.dedup();
        touched
    }

    /// The people on a board, one each, in a steady order (by name, then by identity).
    pub fn viewers(&self, board_id: Uuid, now: Instant) -> Vec<Viewer> {
        let tabs = self.tabs();
        let mut latest: HashMap<Uuid, &Entry> = HashMap::new();
        for entry in tabs.values() {
            if entry.board_id != board_id || now.duration_since(entry.seen) > PRESENCE_TTL {
                continue;
            }
            let newer = latest
                .get(&entry.user_id)
                .is_none_or(|known| entry.seen > known.seen);
            if newer {
                latest.insert(entry.user_id, entry);
            }
        }
        let mut viewers: Vec<Viewer> = latest
            .into_values()
            .map(|entry| Viewer {
                user_id: entry.user_id,
                username: entry.username.clone(),
                card_id: entry.card_id,
            })
            .collect();
        viewers.sort_by(|a, b| {
            a.username
                .to_lowercase()
                .cmp(&b.username.to_lowercase())
                .then(a.user_id.cmp(&b.user_id))
        });
        viewers
    }
}

/// A tab identifier is the one the browser invented for itself: letters, digits and dashes.
pub fn valid_client_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= CLIENT_ID_MAX_LEN
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Scene {
        hub: PresenceHub,
        now: Instant,
        workspace: Uuid,
        board: Uuid,
        other_board: Uuid,
        alice: Uuid,
        wen: Uuid,
    }

    fn scene() -> Scene {
        Scene {
            hub: PresenceHub::new(),
            now: Instant::now(),
            workspace: Uuid::new_v4(),
            board: Uuid::new_v4(),
            other_board: Uuid::new_v4(),
            alice: Uuid::new_v4(),
            wen: Uuid::new_v4(),
        }
    }

    impl Scene {
        fn beat(
            &self,
            tab: &str,
            user: Uuid,
            name: &str,
            board: Uuid,
            card: Option<Uuid>,
            at: Duration,
        ) -> Vec<Touched> {
            self.hub
                .beat(tab, user, name, self.workspace, board, card, self.now + at)
        }
    }

    #[test]
    fn the_first_report_tells_the_board_and_the_heartbeat_does_not() {
        let scene = scene();

        let first = scene.beat("a", scene.alice, "alice", scene.board, None, Duration::ZERO);
        let again = scene.beat(
            "a",
            scene.alice,
            "alice",
            scene.board,
            None,
            Duration::from_secs(20),
        );

        assert_eq!(
            first,
            vec![Touched {
                workspace_id: scene.workspace,
                board_id: scene.board
            }]
        );
        assert!(again.is_empty());
    }

    #[test]
    fn opening_a_card_changes_the_crowd_and_closing_it_does_too() {
        let scene = scene();
        let card = Uuid::new_v4();
        scene.beat("a", scene.alice, "alice", scene.board, None, Duration::ZERO);

        let opened = scene.beat(
            "a",
            scene.alice,
            "alice",
            scene.board,
            Some(card),
            Duration::from_secs(5),
        );
        let closed = scene.beat(
            "a",
            scene.alice,
            "alice",
            scene.board,
            None,
            Duration::from_secs(9),
        );

        assert_eq!(opened.len(), 1);
        assert_eq!(closed.len(), 1);
        assert_eq!(
            scene
                .hub
                .viewers(scene.board, scene.now + Duration::from_secs(10))[0]
                .card_id,
            None
        );
    }

    #[test]
    fn moving_to_another_board_tells_both() {
        let scene = scene();
        scene.beat("a", scene.alice, "alice", scene.board, None, Duration::ZERO);

        let touched = scene.beat(
            "a",
            scene.alice,
            "alice",
            scene.other_board,
            None,
            Duration::from_secs(3),
        );

        assert_eq!(touched.len(), 2);
        assert!(
            scene
                .hub
                .viewers(scene.board, scene.now + Duration::from_secs(4))
                .is_empty()
        );
        assert_eq!(
            scene
                .hub
                .viewers(scene.other_board, scene.now + Duration::from_secs(4))
                .len(),
            1
        );
    }

    #[test]
    fn a_person_with_two_tabs_is_one_viewer_on_the_card_seen_last() {
        let scene = scene();
        let card = Uuid::new_v4();
        scene.beat("a", scene.alice, "alice", scene.board, None, Duration::ZERO);
        scene.beat(
            "b",
            scene.alice,
            "alice",
            scene.board,
            Some(card),
            Duration::from_secs(2),
        );

        let viewers = scene
            .hub
            .viewers(scene.board, scene.now + Duration::from_secs(3));

        assert_eq!(viewers.len(), 1);
        assert_eq!(viewers[0].card_id, Some(card));
    }

    #[test]
    fn viewers_come_in_a_steady_order() {
        let scene = scene();
        scene.beat("w", scene.wen, "Wen", scene.board, None, Duration::ZERO);
        scene.beat(
            "a",
            scene.alice,
            "alice",
            scene.board,
            None,
            Duration::from_secs(1),
        );

        let names: Vec<String> = scene
            .hub
            .viewers(scene.board, scene.now + Duration::from_secs(2))
            .into_iter()
            .map(|viewer| viewer.username)
            .collect();

        assert_eq!(names, ["alice", "Wen"]);
    }

    #[test]
    fn a_tab_that_stops_reporting_expires_and_the_board_is_told() {
        let scene = scene();
        scene.beat("a", scene.alice, "alice", scene.board, None, Duration::ZERO);

        assert!(
            scene
                .hub
                .sweep(scene.now + Duration::from_secs(30))
                .is_empty()
        );
        let touched = scene
            .hub
            .sweep(scene.now + PRESENCE_TTL + Duration::from_secs(1));

        assert_eq!(touched.len(), 1);
        assert!(
            scene
                .hub
                .viewers(
                    scene.board,
                    scene.now + PRESENCE_TTL + Duration::from_secs(2)
                )
                .is_empty()
        );
    }

    #[test]
    fn an_expired_tab_is_never_listed_even_before_the_sweep_runs() {
        let scene = scene();
        scene.beat("a", scene.alice, "alice", scene.board, None, Duration::ZERO);

        let viewers = scene.hub.viewers(
            scene.board,
            scene.now + PRESENCE_TTL + Duration::from_secs(5),
        );

        assert!(viewers.is_empty());
    }

    #[test]
    fn only_the_owner_of_a_tab_can_end_it() {
        let scene = scene();
        scene.beat("a", scene.alice, "alice", scene.board, None, Duration::ZERO);

        assert!(scene.hub.leave("a", scene.wen).is_none());
        assert!(scene.hub.knows("a", scene.alice));
        assert!(scene.hub.leave("a", scene.alice).is_some());
        assert!(!scene.hub.knows("a", scene.alice));
    }

    #[test]
    fn a_tab_identifier_taken_by_someone_else_is_replaced_not_shared() {
        let scene = scene();
        scene.beat("a", scene.alice, "alice", scene.board, None, Duration::ZERO);

        scene.beat(
            "a",
            scene.wen,
            "wen",
            scene.board,
            None,
            Duration::from_secs(1),
        );

        let viewers = scene
            .hub
            .viewers(scene.board, scene.now + Duration::from_secs(2));
        assert_eq!(viewers.len(), 1);
        assert_eq!(viewers[0].username, "wen");
    }

    #[test]
    fn tab_identifiers_are_checked() {
        assert!(valid_client_id("3f2c-91ab"));
        assert!(!valid_client_id(""));
        assert!(!valid_client_id("with space"));
        assert!(!valid_client_id(&"a".repeat(CLIENT_ID_MAX_LEN + 1)));
    }
}
