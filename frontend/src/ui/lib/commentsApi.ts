import { request } from './api';
import type { CommentItem, TimelineItem } from './timeline';

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await request(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return (await response.json()) as T;
}

type Written = Omit<CommentItem, 'type'>;

export async function fetchTimeline(cardId: string): Promise<TimelineItem[]> {
  const data = await send<{ items: TimelineItem[] }>(`/api/cards/${cardId}/timeline`, 'GET');
  return data.items;
}

export async function postComment(cardId: string, body: string): Promise<CommentItem> {
  const written = await send<Written>(`/api/cards/${cardId}/comments`, 'POST', { body });
  return { ...written, type: 'comment' };
}

export async function patchComment(
  cardId: string,
  commentId: string,
  body: string
): Promise<CommentItem> {
  const written = await send<Written>(`/api/cards/${cardId}/comments/${commentId}`, 'PATCH', {
    body,
  });
  return { ...written, type: 'comment' };
}

export async function removeComment(cardId: string, commentId: string): Promise<void> {
  await request(`/api/cards/${cardId}/comments/${commentId}`, { method: 'DELETE' });
}
