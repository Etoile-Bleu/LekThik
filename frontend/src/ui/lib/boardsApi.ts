import { request } from './api';
import type { BoardLook } from './boardLooks';

export type LabelColor =
  'slate' | 'red' | 'orange' | 'amber' | 'green' | 'teal' | 'blue' | 'violet' | 'pink';

export type Priority = 'none' | 'low' | 'medium' | 'high' | 'urgent';

export const LABEL_COLORS: LabelColor[] = [
  'slate',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'violet',
  'pink',
];

export const PRIORITIES: Priority[] = ['none', 'low', 'medium', 'high', 'urgent'];

export interface BoardSummary {
  id: string;
  workspace_id: string;
  name: string;
}

export type Role = 'owner' | 'admin' | 'writer' | 'reader';

export interface Workspace {
  id: string;
  name: string;
  role: Role;
  boards: BoardSummary[];
}

export interface Label {
  id: string;
  board_id: string;
  name: string;
  color: LabelColor;
  priority: Priority;
}

export interface CardSummary {
  id: string;
  list_id: string;
  title: string;
  has_description: boolean;
  /** The first characters of the description, empty when there is none. */
  description_preview: string;
  label_ids: string[];
  assignee_ids: string[];
  /** Calendar day, `YYYY-MM-DD`. */
  due_date: string | null;
}

export type PanelKind =
  | 'list'
  | 'calendar'
  | 'agenda'
  | 'note'
  | 'counter'
  | 'image'
  | 'embed'
  | 'link'
  | 'progress'
  | 'overdue'
  | 'chart';
export type EmbedProvider = 'youtube' | 'vimeo' | 'google_calendar';
export type BlockSize = 'normal' | 'wide';
export type AgendaRange = 'today' | 'week';
export type CounterMetric = 'overdue' | 'done_percent' | 'days_left' | 'total_cards';

export interface CalendarConfig {
  size: BlockSize;
}
export interface AgendaConfig {
  size: BlockSize;
  range: AgendaRange;
  /** Only the cards assigned to whoever is looking. */
  mine_only: boolean;
}
export interface NoteConfig {
  size: BlockSize;
  text: string;
}
export interface CounterConfig {
  size: BlockSize;
  metric: CounterMetric;
  /** Names the number, for instance "Days to launch". */
  label: string;
  done_list_id: string | null;
  /** `YYYY-MM-DD`, for the days left. */
  date: string | null;
}
export interface OverdueConfig {
  size: BlockSize;
}
export type ChartSource = 'list' | 'label' | 'assignee' | 'due';
export type ChartStyle = 'bars' | 'donut';
export interface ChartConfig {
  size: BlockSize;
  source: ChartSource;
  style: ChartStyle;
}
export type ProgressStyle = 'ring' | 'bar';
export interface ProgressConfig {
  size: BlockSize;
  style: ProgressStyle;
  label: string;
  done_list_id: string | null;
}
/** A picture kept by LekThik. The description is required, it is what a screen reader says. */
export interface ImageConfig {
  size: BlockSize;
  alt: string;
  caption: string;
}
/** A video or calendar, stored as the provider and its identifier only. */
export interface EmbedConfig {
  size: BlockSize;
  provider: EmbedProvider;
  id: string;
  /** Names the frame for screen readers. */
  title: string;
}
export interface LinkConfig {
  size: BlockSize;
  url: string;
  title: string;
}
export type PanelConfig =
  | ImageConfig
  | EmbedConfig
  | LinkConfig
  | Record<string, unknown>
  | CalendarConfig
  | AgendaConfig
  | NoteConfig
  | CounterConfig
  | ProgressConfig
  | OverdueConfig
  | ChartConfig;

/**
 * One panel of a board: a list of cards, or a block that shows something else.
 * Only a list holds cards, a block always has an empty `cards`.
 */
export interface BoardList {
  id: string;
  name: string;
  /** Work in progress limit, warns when the list holds more cards. `null` for none. */
  wip_limit: number | null;
  kind: PanelKind;
  config: PanelConfig;
  /** Changes with every new picture of an image block, `null` while it has none. */
  image_version?: number | null;
  /** Where it sits on the free layout, `null` until somebody places it. */
  layout?: { x: number; y: number; w: number; h: number } | null;
  cards: CardSummary[];
}

/** A card assigned to the signed in person, with where it lives. */
export interface AssignedCard {
  id: string;
  title: string;
  /** Calendar day, `YYYY-MM-DD`. */
  due_date: string | null;
  list_id: string;
  list_name: string;
  board_id: string;
  board_name: string;
  workspace_id: string;
  workspace_name: string;
}

export interface BoardMember {
  user_id: string;
  username: string;
}

export interface BoardView {
  board: BoardSummary;
  role: Role;
  look: BoardLook;
  members: BoardMember[];
  lists: BoardList[];
  labels: Label[];
}

export interface CardDetail {
  id: string;
  list_id: string;
  title: string;
  description: string;
  label_ids: string[];
  assignee_ids: string[];
  due_date: string | null;
}

export interface TemplateLabel {
  name: string;
  color: LabelColor;
  priority: Priority;
}

export interface TemplateCard {
  title: string;
  description: string;
  labels: string[];
}

export interface TemplateList {
  name: string;
  cards: TemplateCard[];
}

export interface BoardTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  labels: TemplateLabel[];
  lists: TemplateList[];
}

export interface WorkspaceTemplate {
  id: string;
  name: string;
  description: string;
  board_ids: string[];
}

export interface TemplateCatalogue {
  boards: BoardTemplate[];
  workspaces: WorkspaceTemplate[];
}

interface Identified {
  id: string;
  name: string;
}

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await request(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return (await response.json()) as T;
}

async function sendWithoutResult(path: string, method: string, body?: unknown): Promise<void> {
  await request(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export function fetchWorkspaces(): Promise<Workspace[]> {
  return send<Workspace[]>('/api/workspaces', 'GET');
}

export function fetchTemplates(): Promise<TemplateCatalogue> {
  return send<TemplateCatalogue>('/api/templates', 'GET');
}

export function createWorkspace(name: string, templateId?: string | null): Promise<Workspace> {
  return send<Workspace>('/api/workspaces', 'POST', {
    name,
    ...(templateId ? { template_id: templateId } : {}),
  });
}

export function renameWorkspace(id: string, name: string): Promise<Identified> {
  return send<Identified>(`/api/workspaces/${id}`, 'PATCH', { name });
}

export function deleteWorkspace(id: string): Promise<void> {
  return sendWithoutResult(`/api/workspaces/${id}`, 'DELETE');
}

export function createBoard(
  workspaceId: string,
  name: string,
  templateId?: string | null
): Promise<BoardSummary> {
  return send<BoardSummary>(`/api/workspaces/${workspaceId}/boards`, 'POST', {
    name,
    ...(templateId ? { template_id: templateId } : {}),
  });
}

export function setBoardLook(id: string, look: BoardLook): Promise<BoardLook> {
  return send<BoardLook>(`/api/boards/${id}/look`, 'PUT', look);
}

export function fetchBoard(id: string): Promise<BoardView> {
  return send<BoardView>(`/api/boards/${id}`, 'GET');
}

export function renameBoard(id: string, name: string): Promise<BoardSummary> {
  return send<BoardSummary>(`/api/boards/${id}`, 'PATCH', { name });
}

export function deleteBoard(id: string): Promise<void> {
  return sendWithoutResult(`/api/boards/${id}`, 'DELETE');
}

export function createList(boardId: string, name: string): Promise<Identified> {
  return send<Identified>(`/api/boards/${boardId}/lists`, 'POST', { name });
}

export function renameList(id: string, name: string): Promise<Identified> {
  return send<Identified>(`/api/lists/${id}`, 'PATCH', { name });
}

export function setListWipLimit(id: string, limit: number | null): Promise<Identified> {
  return send<Identified>(`/api/lists/${id}/wip-limit`, 'PUT', { limit });
}

export async function fetchMyCards(): Promise<AssignedCard[]> {
  const response = await request('/api/users/me/cards');
  return (await response.json()) as AssignedCard[];
}

export function createBlock(
  boardId: string,
  kind: Exclude<PanelKind, 'list'>,
  name: string,
  config: PanelConfig
): Promise<BoardList> {
  return send<BoardList>(`/api/boards/${boardId}/blocks`, 'POST', { kind, name, config });
}

export async function uploadBlockImage(id: string, file: Blob): Promise<{ image_version: number }> {
  const response = await request(`/api/blocks/${id}/image`, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': 'application/octet-stream' },
  });
  return (await response.json()) as { image_version: number };
}

export async function fetchBlockImage(id: string): Promise<Blob> {
  const response = await request(`/api/blocks/${id}/image`);
  return response.blob();
}

export function setBlockConfig(
  id: string,
  kind: Exclude<PanelKind, 'list'>,
  config: PanelConfig
): Promise<BoardList> {
  return send<BoardList>(`/api/blocks/${id}/config`, 'PUT', { kind, config });
}

export function moveList(id: string, index: number): Promise<void> {
  return sendWithoutResult(`/api/lists/${id}/move`, 'POST', { index });
}

export function setBoardLayout(
  boardId: string,
  items: Array<{ id: string; x: number; y: number; w: number; h: number }>
): Promise<void> {
  return sendWithoutResult(`/api/boards/${boardId}/layout`, 'PUT', { items });
}

export function deleteList(id: string): Promise<void> {
  return sendWithoutResult(`/api/lists/${id}`, 'DELETE');
}

export function duplicateCard(id: string): Promise<CardSummary> {
  return send<CardSummary>(`/api/cards/${id}/duplicate`, 'POST');
}

export function duplicatePanel(id: string): Promise<{ id: string; name: string }> {
  return send<{ id: string; name: string }>(`/api/lists/${id}/duplicate`, 'POST');
}

export function createCard(listId: string, title: string): Promise<CardSummary> {
  return send<CardSummary>(`/api/lists/${listId}/cards`, 'POST', { title });
}

export function fetchCard(id: string): Promise<CardDetail> {
  return send<CardDetail>(`/api/cards/${id}`, 'GET');
}

export function updateCard(
  id: string,
  changes: { title?: string; description?: string; due_date?: string | null }
): Promise<CardDetail> {
  return send<CardDetail>(`/api/cards/${id}`, 'PATCH', changes);
}

export function moveCard(id: string, listId: string, index: number): Promise<void> {
  return sendWithoutResult(`/api/cards/${id}/move`, 'POST', { list_id: listId, index });
}

export function deleteCard(id: string): Promise<void> {
  return sendWithoutResult(`/api/cards/${id}`, 'DELETE');
}

export function setCardLabels(id: string, labelIds: string[]): Promise<{ label_ids: string[] }> {
  return send<{ label_ids: string[] }>(`/api/cards/${id}/labels`, 'PUT', {
    label_ids: labelIds,
  });
}

export function setCardAssignees(
  id: string,
  userIds: string[]
): Promise<{ assignee_ids: string[] }> {
  return send<{ assignee_ids: string[] }>(`/api/cards/${id}/assignees`, 'PUT', {
    user_ids: userIds,
  });
}

export function createLabel(
  boardId: string,
  label: { name: string; color: LabelColor; priority: Priority }
): Promise<Label> {
  return send<Label>(`/api/boards/${boardId}/labels`, 'POST', label);
}

export function updateLabel(
  id: string,
  changes: { name?: string; color?: LabelColor; priority?: Priority }
): Promise<Label> {
  return send<Label>(`/api/labels/${id}`, 'PATCH', changes);
}

export function deleteLabel(id: string): Promise<void> {
  return sendWithoutResult(`/api/labels/${id}`, 'DELETE');
}
