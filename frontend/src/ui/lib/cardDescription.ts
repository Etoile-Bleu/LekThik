import { updateCard } from './boardsApi';
import { useBoardStore } from './boardStore';
import { record, resolveId } from './history';

async function write(cardId: string, text: string): Promise<void> {
  const saved = await updateCard(resolveId(cardId), { description: text });
  useBoardStore.getState().markHasDescription(saved.id, saved.description.trim() !== '');
}

export function recordDescription(cardId: string, before: string, after: string): void {
  if (before === after) return;
  record({
    label: 'Edit description',
    undo: () => write(cardId, before),
    redo: () => write(cardId, after),
  });
}
