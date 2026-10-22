use std::collections::HashSet;
use std::convert::Infallible;
use std::sync::Arc;
use std::time::Duration;

use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use futures_util::stream::{self, Stream, StreamExt};
use serde::Serialize;
use tokio::sync::broadcast;
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::boards_error::boards_error_response;
use crate::dto::ErrorResponseDto;
use crate::state::AppState;

const CHANNEL_CAPACITY: usize = 1024;
const KEEP_ALIVE_SECONDS: u64 = 15;
const CLIENT_ID_HEADER: &str = "x-client-id";
const CLIENT_ID_MAX_LEN: usize = 64;

/// What changed, never the data itself. Clients refetch what they display, so
/// a lost or duplicated event only costs one extra request and authorization
/// stays where it belongs, on the read endpoints.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Change {
    /// Lists, cards or labels of a board changed.
    Board { workspace_id: Uuid, board_id: Uuid },
    /// The workspace itself changed: name, boards.
    Workspace { workspace_id: Uuid },
    /// Members or pending invitations changed. `user_id` is the person whose
    /// membership was added, changed or removed.
    Members {
        workspace_id: Uuid,
        user_id: Option<Uuid>,
    },
    /// A new invitation reached, or left, this email address.
    Invitations { email: String },
    /// The list of workspaces of one user changed.
    User { user_id: Uuid },
}

#[derive(Debug, Clone)]
pub struct ChangeEvent {
    pub change: Change,
    /// Browser tab that caused the change, so it can skip its own echo.
    pub origin: Option<String>,
}

#[derive(Serialize)]
struct Payload<'a> {
    workspace_id: Option<Uuid>,
    board_id: Option<Uuid>,
    user_id: Option<Uuid>,
    origin: Option<&'a str>,
}

impl ChangeEvent {
    fn name(&self) -> &'static str {
        match self.change {
            Change::Board { .. } => "board",
            Change::Workspace { .. } => "workspace",
            Change::Members { .. } => "members",
            Change::Invitations { .. } => "invitations",
            Change::User { .. } => "workspaces",
        }
    }

    fn payload(&self) -> Payload<'_> {
        let (workspace_id, board_id, user_id) = match &self.change {
            Change::Board {
                workspace_id,
                board_id,
            } => (Some(*workspace_id), Some(*board_id), None),
            Change::Workspace { workspace_id } => (Some(*workspace_id), None, None),
            Change::Members {
                workspace_id,
                user_id,
            } => (Some(*workspace_id), None, *user_id),
            Change::Invitations { .. } => (None, None, None),
            Change::User { user_id } => (None, None, Some(*user_id)),
        };

        Payload {
            workspace_id,
            board_id,
            user_id,
            origin: self.origin.as_deref(),
        }
    }
}

/// In-process fan-out. This is the only place that knows how events travel:
/// moving to several server instances means swapping the channel for Postgres
/// LISTEN/NOTIFY or Redis pub/sub behind `publish` and `subscribe`.
#[derive(Clone)]
pub struct EventHub {
    sender: broadcast::Sender<Arc<ChangeEvent>>,
}

impl EventHub {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(CHANNEL_CAPACITY);
        Self { sender }
    }

    pub fn publish(&self, change: Change, origin: Option<String>) {
        // An error only means nobody is listening.
        let _ = self.sender.send(Arc::new(ChangeEvent { change, origin }));
    }

    fn subscribe(&self) -> broadcast::Receiver<Arc<ChangeEvent>> {
        self.sender.subscribe()
    }
}

impl Default for EventHub {
    fn default() -> Self {
        Self::new()
    }
}

/// Reads the optional tab identifier sent by the browser.
pub fn client_origin(headers: &HeaderMap) -> Option<String> {
    let value = headers.get(CLIENT_ID_HEADER)?.to_str().ok()?.trim();
    let valid = !value.is_empty()
        && value.len() <= CLIENT_ID_MAX_LEN
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-');

    valid.then(|| value.to_string())
}

struct Connection {
    receiver: broadcast::Receiver<Arc<ChangeEvent>>,
    state: AppState,
    user_id: Uuid,
    email: String,
    workspaces: HashSet<Uuid>,
}

impl Connection {
    async fn refresh_workspaces(&mut self) {
        match self.state.member_repo.workspace_ids_of(self.user_id).await {
            Ok(ids) => self.workspaces = ids.into_iter().collect(),
            Err(error) => eprintln!("refreshing the event audience failed: {error}"),
        }
    }

    /// Decides whether this connection hears about an event. A membership
    /// change aimed at the user refreshes the audience first, so access that
    /// was just granted starts streaming and access that was just removed
    /// stops, while the person concerned is still told.
    async fn deliver(&mut self, event: &ChangeEvent) -> bool {
        match &event.change {
            Change::Members {
                user_id: Some(subject),
                ..
            } if *subject == self.user_id => {
                self.refresh_workspaces().await;
                true
            }
            Change::User { user_id } if *user_id == self.user_id => {
                self.refresh_workspaces().await;
                true
            }
            Change::User { .. } => false,
            Change::Invitations { email } => *email == self.email,
            Change::Board { workspace_id, .. }
            | Change::Workspace { workspace_id }
            | Change::Members { workspace_id, .. } => self.workspaces.contains(workspace_id),
        }
    }
}

fn to_sse(event: &ChangeEvent) -> Event {
    let data = serde_json::to_string(&event.payload()).unwrap_or_else(|_| "{}".to_string());
    Event::default().event(event.name()).data(data)
}

fn event_stream(connection: Connection) -> impl Stream<Item = Result<Event, Infallible>> {
    let ready = stream::once(async { Ok(Event::default().event("ready").data("{}")) });

    let changes = stream::unfold(connection, |mut connection| async move {
        loop {
            match connection.receiver.recv().await {
                Ok(event) => {
                    if connection.deliver(&event).await {
                        return Some((Ok(to_sse(&event)), connection));
                    }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => {
                    connection.refresh_workspaces().await;
                    return Some((Ok(Event::default().event("resync").data("{}")), connection));
                }
                Err(broadcast::error::RecvError::Closed) => return None,
            }
        }
    });

    ready.chain(changes)
}

#[utoipa::path(
    get,
    path = "/events",
    tag = "events",
    summary = "Stream live changes",
    description = "Server-sent events telling the signed in user what changed in the workspaces they belong to (board, workspace, members, invitations, workspaces) so the client can refetch it. Events carry identifiers only. A resync event means some events were missed and everything should be refetched.",
    responses(
        (status = 200, description = "text/event-stream"),
        (status = 401, body = ErrorResponseDto),
    )
)]
pub async fn stream_events(State(state): State<AppState>, AuthUser(user_id): AuthUser) -> Response {
    // Subscribe before reading memberships so nothing published in between is lost.
    let receiver = state.events.subscribe();

    let user = match state.user_repo.find_by_id(user_id).await {
        Ok(Some(user)) => user,
        Ok(None) => return unauthorized_stream(),
        Err(error) => {
            eprintln!("event stream user lookup failed: {error}");
            return boards_error_response(domain::boards::BoardsError::Repository(
                error.to_string(),
            ));
        }
    };

    let workspaces = match state.member_repo.workspace_ids_of(user_id).await {
        Ok(ids) => ids.into_iter().collect(),
        Err(error) => return boards_error_response(error),
    };

    let connection = Connection {
        receiver,
        state,
        user_id,
        email: user.email.to_lowercase(),
        workspaces,
    };

    Sse::new(event_stream(connection))
        .keep_alive(KeepAlive::new().interval(Duration::from_secs(KEEP_ALIVE_SECONDS)))
        .into_response()
}

fn unauthorized_stream() -> Response {
    (
        axum::http::StatusCode::UNAUTHORIZED,
        axum::Json(ErrorResponseDto {
            message: "missing or invalid session".to_string(),
        }),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hub_event(change: Change) -> ChangeEvent {
        ChangeEvent {
            change,
            origin: Some("tab-1".to_string()),
        }
    }

    #[test]
    fn names_each_change_for_the_client() {
        let workspace_id = Uuid::new_v4();
        let board_id = Uuid::new_v4();

        assert_eq!(
            hub_event(Change::Board {
                workspace_id,
                board_id
            })
            .name(),
            "board"
        );
        assert_eq!(
            hub_event(Change::Workspace { workspace_id }).name(),
            "workspace"
        );
        assert_eq!(
            hub_event(Change::Members {
                workspace_id,
                user_id: None
            })
            .name(),
            "members"
        );
    }

    #[test]
    fn payloads_never_carry_an_email_address() {
        let event = hub_event(Change::Invitations {
            email: "marie@example.com".to_string(),
        });

        let json = serde_json::to_string(&event.payload()).expect("json");

        assert!(!json.contains("marie"));
        assert!(json.contains("tab-1"));
    }

    #[test]
    fn accepts_only_short_alphanumeric_client_ids() {
        let mut headers = HeaderMap::new();
        headers.insert(CLIENT_ID_HEADER, "abc-123".parse().expect("header"));
        assert_eq!(client_origin(&headers).as_deref(), Some("abc-123"));

        headers.insert(CLIENT_ID_HEADER, "a b".parse().expect("header"));
        assert_eq!(client_origin(&headers), None);

        headers.insert(CLIENT_ID_HEADER, "x".repeat(65).parse().expect("header"));
        assert_eq!(client_origin(&headers), None);
    }

    #[test]
    fn hub_delivers_to_subscribers_and_ignores_empty_rooms() {
        let hub = EventHub::new();
        hub.publish(
            Change::User {
                user_id: Uuid::new_v4(),
            },
            None,
        );

        let mut receiver = hub.subscribe();
        let user_id = Uuid::new_v4();
        hub.publish(Change::User { user_id }, Some("tab".to_string()));

        let received = receiver.try_recv().map(|event| event.change.clone());
        assert_eq!(received, Ok(Change::User { user_id }));
    }
}
