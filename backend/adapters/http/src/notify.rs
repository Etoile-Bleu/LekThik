use axum::extract::{OriginalUri, Request, State};
use axum::http::Method;
use axum::middleware::Next;
use axum::response::Response;
use domain::boards::Target;
use uuid::Uuid;

use crate::events::{Change, client_origin};
use crate::state::AppState;

/// What a successful request changed, found from its method and path alone.
#[derive(Debug, PartialEq, Eq)]
struct Plan {
    target: Target,
    /// The workspace sidebar (name, boards) changes too, not only a board.
    touches_workspace: bool,
    touches_board: bool,
}

fn plan_for(method: &Method, path: &str) -> Option<Plan> {
    if method == Method::GET || method == Method::HEAD || method == Method::OPTIONS {
        return None;
    }

    let mut segments = path.trim_matches('/').split('/').peekable();
    if segments.peek() == Some(&"api") {
        segments.next();
    }
    let segments: Vec<&str> = segments.collect();

    let id = segments.get(1)?.parse::<Uuid>().ok()?;
    match (
        segments.first().copied()?,
        segments.len(),
        segments.get(2).copied(),
    ) {
        ("workspaces", 2, _) | ("workspaces", 3, Some("boards")) => Some(Plan {
            target: Target::Workspace(id),
            touches_workspace: true,
            touches_board: false,
        }),
        ("boards", 2, _) => Some(Plan {
            target: Target::Board(id),
            touches_workspace: true,
            touches_board: true,
        }),
        ("boards", 3, Some("lists" | "labels" | "look" | "blocks")) => Some(Plan {
            target: Target::Board(id),
            touches_workspace: false,
            touches_board: true,
        }),
        ("lists" | "blocks", _, _) => Some(Plan {
            target: Target::List(id),
            touches_workspace: false,
            touches_board: true,
        }),
        ("cards", _, _) => Some(Plan {
            target: Target::Card(id),
            touches_workspace: false,
            touches_board: true,
        }),
        ("labels", _, _) => Some(Plan {
            target: Target::Label(id),
            touches_workspace: false,
            touches_board: true,
        }),
        _ => None,
    }
}

/// Publishes a change event after every successful write on boards, lists,
/// cards and labels. The resource is located before the handler runs because
/// a delete removes the very row that tells which workspace it belonged to.
pub async fn notify_changes(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    let path = request
        .extensions()
        .get::<OriginalUri>()
        .map(|original| original.path().to_string())
        .unwrap_or_else(|| request.uri().path().to_string());
    let plan = plan_for(request.method(), &path);
    let origin = client_origin(request.headers());

    let located = match &plan {
        Some(plan) => match state.locator.locate(plan.target).await {
            Ok(located) => located,
            Err(error) => {
                eprintln!("locating the changed resource failed: {error}");
                None
            }
        },
        None => None,
    };

    let response = next.run(request).await;

    if let (Some(plan), Some(located)) = (plan, located)
        && response.status().is_success()
    {
        if plan.touches_workspace {
            state.events.publish(
                Change::Workspace {
                    workspace_id: located.workspace_id,
                },
                origin.clone(),
            );
        }
        if let (true, Some(board_id)) = (plan.touches_board, located.board_id) {
            state.events.publish(
                Change::Board {
                    workspace_id: located.workspace_id,
                    board_id,
                },
                origin,
            );
        }
    }

    response
}

#[cfg(test)]
mod tests {
    use super::*;

    fn path(rest: &str) -> String {
        format!("/api/{rest}")
    }

    #[test]
    fn reads_never_notify() {
        let id = Uuid::new_v4();

        assert_eq!(plan_for(&Method::GET, &path(&format!("boards/{id}"))), None);
    }

    #[test]
    fn board_content_writes_touch_the_board_only() {
        let id = Uuid::new_v4();

        for rest in [
            format!("boards/{id}/lists"),
            format!("boards/{id}/labels"),
            format!("boards/{id}/look"),
            format!("lists/{id}"),
            format!("lists/{id}/move"),
            format!("lists/{id}/wip-limit"),
            format!("boards/{id}/blocks"),
            format!("blocks/{id}/config"),
            format!("cards/{id}"),
            format!("cards/{id}/labels"),
            format!("cards/{id}/assignees"),
            format!("labels/{id}"),
        ] {
            let plan = plan_for(&Method::PATCH, &path(&rest)).expect(&rest);
            assert!(plan.touches_board && !plan.touches_workspace, "{rest}");
        }
    }

    #[test]
    fn renaming_or_deleting_a_board_touches_the_sidebar_too() {
        let id = Uuid::new_v4();

        let plan = plan_for(&Method::DELETE, &path(&format!("boards/{id}"))).expect("plan");

        assert_eq!(plan.target, Target::Board(id));
        assert!(plan.touches_board && plan.touches_workspace);
    }

    #[test]
    fn workspace_level_writes_touch_the_sidebar() {
        let id = Uuid::new_v4();

        for rest in [
            format!("workspaces/{id}"),
            format!("workspaces/{id}/boards"),
        ] {
            let plan = plan_for(&Method::POST, &path(&rest)).expect(&rest);
            assert_eq!(plan.target, Target::Workspace(id));
            assert!(plan.touches_workspace && !plan.touches_board);
        }
    }

    #[test]
    fn member_and_invitation_routes_publish_from_their_own_handlers() {
        let id = Uuid::new_v4();

        for rest in [
            format!("workspaces/{id}/members/{id}"),
            format!("workspaces/{id}/invitations"),
            format!("invitations/{id}/accept"),
            "workspaces".to_string(),
            "users/register".to_string(),
        ] {
            assert_eq!(plan_for(&Method::POST, &path(&rest)), None, "{rest}");
        }
    }
}
