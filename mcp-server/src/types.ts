/**
 * The shapes LekThik's API actually returns, copied by hand from its own OpenAPI document
 * (GET /api-docs/openapi.json on a running server) rather than generated, since this file only
 * needs the handful of fields the tools below read or send.
 */

export interface Workspace {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'writer' | 'reader';
}

export interface WorkspaceWithBoards extends Workspace {
  boards: BoardSummary[];
}

export interface BoardSummary {
  id: string;
  workspace_id: string;
  name: string;
}

export interface Board extends BoardSummary {
  /** The list that means "done", for cycle time. `null` until someone chooses one. */
  done_list_id: string | null;
}

export interface BoardLook {
  background: string;
  accent: string;
}

export interface BoardMember {
  user_id: string;
  username: string;
}

export interface CardSummary {
  id: string;
  list_id: string;
  title: string;
  has_description: boolean;
  description_preview: string;
  label_ids: string[];
  assignee_ids: string[];
  due_date: string | null;
  comment_count: number;
  created_at: string;
  /** When the card arrived in whichever list it currently sits in; how its age is measured. */
  list_entered_at: string;
  blocked_since: string | null;
  blocked_reason: string | null;
}

export interface ListWithCards {
  id: string;
  name: string;
  kind: string;
  config: Record<string, unknown>;
  wip_limit: number | null;
  cards: CardSummary[];
}

export interface Label {
  id: string;
  board_id: string;
  name: string;
  color: string;
  priority: string;
}

export interface BoardView {
  board: Board;
  role: string;
  look: BoardLook;
  members: BoardMember[];
  lists: ListWithCards[];
  labels: Label[];
}

export interface Card {
  id: string;
  list_id: string;
  title: string;
  description: string;
  due_date: string | null;
  label_ids: string[];
  assignee_ids: string[];
  created_at: string;
  list_entered_at: string;
  blocked_since: string | null;
  blocked_reason: string | null;
}

export interface Member {
  user_id: string;
  username: string;
  email: string;
  role: 'owner' | 'admin' | 'writer' | 'reader';
  joined_at: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: string;
}

export interface MembersResponse {
  role: string;
  members: Member[];
  invitations: Invitation[];
}

export interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
}

export interface WorkspaceTemplate {
  id: string;
  name: string;
  description: string;
  board_ids: string[];
}

export interface Templates {
  workspaces: WorkspaceTemplate[];
  boards: BoardTemplate[];
}

export interface CurrentUser {
  id: string;
  email: string;
  username: string;
}
