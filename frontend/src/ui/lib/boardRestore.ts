import * as api from './boardsApi';
import type { BoardList, BoardView, CardSummary, FieldValue, Label } from './boardsApi';
import * as fieldsApi from './fieldsApi';
import { resolveId } from './history';

export interface CardSnapshot {
  card: CardSummary;
  listId: string;
  index: number;
  description: string;
  values: Array<{ field_id: string; value: FieldValue }>;
}

export interface PanelSnapshot {
  panel: BoardList;
  index: number;
  cards: CardSnapshot[];
}

export interface LabelSnapshot {
  label: Label;
  cardIds: string[];
}

async function attempt(step: () => Promise<unknown>): Promise<void> {
  try {
    await step();
  } catch {
    return;
  }
}

export function snapshotCardFrom(
  view: BoardView,
  cardId: string,
  description: string
): CardSnapshot | null {
  for (const list of view.lists) {
    const index = list.cards.findIndex((card) => card.id === cardId);
    if (index !== -1) {
      return {
        card: list.cards[index],
        listId: list.id,
        index,
        description,
        values: (view.field_values ?? [])
          .filter((entry) => entry.card_id === cardId)
          .map((entry) => ({ field_id: entry.field_id, value: entry.value })),
      };
    }
  }
  return null;
}

export async function describeCard(view: BoardView, cardId: string): Promise<CardSnapshot | null> {
  const known = view.lists.flatMap((list) => list.cards).find((card) => card.id === cardId);
  if (!known) return null;
  const description = known.has_description ? (await api.fetchCard(cardId)).description : '';
  return snapshotCardFrom(view, cardId, description);
}

export async function describePanel(
  view: BoardView,
  panelId: string
): Promise<PanelSnapshot | null> {
  const index = view.lists.findIndex((list) => list.id === panelId);
  if (index === -1) return null;
  const panel = view.lists[index];
  const cards: CardSnapshot[] = [];
  for (const card of panel.cards) {
    const snapshot = await describeCard(view, card.id);
    if (!snapshot) return null;
    cards.push(snapshot);
  }
  return { panel, index, cards };
}

export function describeLabel(view: BoardView, labelId: string): LabelSnapshot | null {
  const label = view.labels.find((entry) => entry.id === labelId);
  if (!label) return null;
  const cardIds = view.lists
    .flatMap((list) => list.cards)
    .filter((card) => card.label_ids.includes(labelId))
    .map((card) => card.id);
  return { label, cardIds };
}

export async function restoreCard(
  snapshot: CardSnapshot,
  listId: string = snapshot.listId
): Promise<CardSummary> {
  const { card } = snapshot;
  const created = await api.createCard(listId, card.title);
  await attempt(() => api.moveCard(created.id, listId, snapshot.index));
  if (card.label_ids.length > 0) {
    await attempt(() => api.setCardLabels(created.id, card.label_ids.map(resolveId)));
  }
  if (card.assignee_ids.length > 0) {
    await attempt(() => api.setCardAssignees(created.id, card.assignee_ids));
  }
  if (card.due_date || snapshot.description !== '') {
    await attempt(() =>
      api.updateCard(created.id, {
        ...(card.due_date ? { due_date: card.due_date } : {}),
        ...(snapshot.description !== '' ? { description: snapshot.description } : {}),
      })
    );
  }
  for (const entry of snapshot.values) {
    await attempt(() => fieldsApi.setFieldValue(created.id, entry.field_id, entry.value));
  }
  return created;
}

export interface RestoredPanel {
  id: string;
  cards: Array<[string, string]>;
}

export async function restorePanel(
  boardId: string,
  snapshot: PanelSnapshot
): Promise<RestoredPanel> {
  const { panel } = snapshot;
  let id: string;
  if (panel.kind === 'list') {
    id = (await api.createList(boardId, panel.name)).id;
    if (panel.wip_limit !== null) {
      await attempt(() => api.setListWipLimit(id, panel.wip_limit));
    }
  } else {
    id = (await api.createBlock(boardId, panel.kind, panel.name, panel.config)).id;
  }
  await attempt(() => api.moveList(id, snapshot.index));
  const cards: Array<[string, string]> = [];
  for (const card of snapshot.cards) {
    const created = await restoreCard(card, id);
    cards.push([card.card.id, created.id]);
  }
  return { id, cards };
}

export async function restoreLabel(boardId: string, snapshot: LabelSnapshot): Promise<string> {
  const { label } = snapshot;
  const created = await api.createLabel(boardId, {
    name: label.name,
    color: label.color,
    priority: label.priority,
  });
  const view = await api.fetchBoard(boardId);
  for (const cardId of snapshot.cardIds) {
    const card = view.lists.flatMap((list) => list.cards).find((entry) => entry.id === cardId);
    if (card) {
      await attempt(() => api.setCardLabels(cardId, [...card.label_ids, created.id]));
    }
  }
  return created.id;
}
