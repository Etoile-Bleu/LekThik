import { request } from './api';
import type { Field, FieldKind, FieldValue, LabelColor } from './boardsApi';

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await request(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return (await response.json()) as T;
}

export interface NewFieldInput {
  name: string;
  kind: FieldKind;
  options?: Array<{ name: string; color: LabelColor }>;
  show_on_card?: boolean;
}

export function createField(boardId: string, input: NewFieldInput): Promise<Field> {
  return send<Field>(`/api/boards/${boardId}/fields`, 'POST', input);
}

export function updateField(
  boardId: string,
  fieldId: string,
  changes: { name?: string; show_on_card?: boolean; position?: number }
): Promise<Field> {
  return send<Field>(`/api/boards/${boardId}/fields/${fieldId}`, 'PATCH', changes);
}

export async function deleteField(boardId: string, fieldId: string): Promise<void> {
  await request(`/api/boards/${boardId}/fields/${fieldId}`, { method: 'DELETE' });
}

export function addOption(
  boardId: string,
  fieldId: string,
  input: { name: string; color: LabelColor }
): Promise<Field> {
  return send<Field>(`/api/boards/${boardId}/fields/${fieldId}/options`, 'POST', input);
}

export function updateOption(
  boardId: string,
  fieldId: string,
  optionId: string,
  changes: { name?: string; color?: LabelColor }
): Promise<Field> {
  return send<Field>(
    `/api/boards/${boardId}/fields/${fieldId}/options/${optionId}`,
    'PATCH',
    changes
  );
}

export function deleteOption(boardId: string, fieldId: string, optionId: string): Promise<Field> {
  return send<Field>(`/api/boards/${boardId}/fields/${fieldId}/options/${optionId}`, 'DELETE');
}

export async function setFieldValue(
  cardId: string,
  fieldId: string,
  value: FieldValue | null
): Promise<FieldValue | null> {
  const saved = await send<{ value: FieldValue | null }>(
    `/api/cards/${cardId}/fields/${fieldId}`,
    'PUT',
    { value }
  );
  return saved.value;
}
