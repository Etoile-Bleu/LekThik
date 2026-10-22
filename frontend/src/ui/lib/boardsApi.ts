import { request } from './api';

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
  label_ids: string[];
  assignee_ids: string[];
  /** Calendar day, `YYYY-MM-DD`. */
  due_date: string | null;
}

export interface BoardList {
  id: string;
  name: string;
  cards: CardSummary[];
}

export interface BoardMember {
  user_id: string;
  username: string;
}

export interface BoardView {
  board: BoardSummary;
  role: Role;
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

export function moveList(id: string, index: number): Promise<void> {
  return sendWithoutResult(`/api/lists/${id}/move`, 'POST', { index });
}

export function deleteList(id: string): Promise<void> {
  return sendWithoutResult(`/api/lists/${id}`, 'DELETE');
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
