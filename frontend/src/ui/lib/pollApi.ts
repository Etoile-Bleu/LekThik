import { request } from './api';

export async function castVote(listId: string, optionId: string): Promise<void> {
  await request(`/api/lists/${listId}/poll/vote`, {
    method: 'PUT',
    body: JSON.stringify({ option_id: optionId }),
  });
}

export async function withdrawVote(listId: string): Promise<void> {
  await request(`/api/lists/${listId}/poll/vote`, { method: 'DELETE' });
}
