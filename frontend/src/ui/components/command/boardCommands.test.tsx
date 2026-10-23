import { describe, expect, it, vi } from 'vitest';

import { EMPTY_FILTER } from '@lib/boardModel';
import type { BoardList, BoardView, CardSummary } from '@lib/boardsApi';
import type { Command } from '@lib/commandStore';

import { type BoardCommandContext, boardCommands } from './boardCommands';

function card(id: string, listId: string, assignees: string[] = []): CardSummary {
  return {
    id,
    list_id: listId,
    title: `Card ${id}`,
    has_description: false,
    description_preview: '',
    label_ids: [],
    assignee_ids: assignees,
    due_date: null,
  };
}

const LISTS: BoardList[] = [
  {
    id: 'todo',
    name: 'To do',
    wip_limit: null,
    kind: 'list',
    config: {},
    cards: [card('a', 'todo'), card('b', 'todo', ['me'])],
  },
  { id: 'done', name: 'Done', wip_limit: null, kind: 'list', config: {}, cards: [] },
  {
    id: 'note',
    name: 'Notes',
    wip_limit: null,
    kind: 'note',
    config: { size: 'normal', text: '' },
    cards: [],
  },
];

function context(over: Partial<BoardCommandContext> = {}): BoardCommandContext {
  return {
    view: {
      board: { id: 'b', workspace_id: 'w', name: 'Sprint' },
      role: 'owner',
      lists: LISTS,
      labels: [],
      members: [],
    } as unknown as BoardView,
    meId: 'me',
    editable: true,
    canManage: true,
    currentView: 'board',
    filter: EMPTY_FILTER,
    setFilter: vi.fn(),
    changeView: vi.fn(),
    fit: vi.fn(),
    openCard: vi.fn(),
    openMembers: vi.fn(),
    openLabels: vi.fn(),
    openLimit: vi.fn(),
    openBlockSettings: vi.fn(),
    openPosition: vi.fn(),
    askDelete: vi.fn(),
    askDeleteBoard: vi.fn(),
    addBlock: vi.fn(),
    actions: {
      createCard: vi.fn().mockResolvedValue(undefined),
      createList: vi.fn().mockResolvedValue(undefined),
      renameBoard: vi.fn().mockResolvedValue(undefined),
      renameList: vi.fn().mockResolvedValue(undefined),
      moveCard: vi.fn().mockResolvedValue(undefined),
      setCardDueDate: vi.fn().mockResolvedValue(undefined),
      setCardAssignees: vi.fn().mockResolvedValue(undefined),
    },
    ...over,
  };
}

function byId(commands: Command[], id: string): Command {
  const found = commands.find((item) => item.id === id);
  if (!found) throw new Error(`no command ${id}`);
  return found;
}

describe('boardCommands', () => {
  it('makes every card findable by its title', () => {
    const commands = boardCommands(context());

    expect(byId(commands, 'card:a')).toMatchObject({
      title: 'Card a',
      hint: 'To do',
      searchOnly: true,
    });
  });

  it('opens a card', () => {
    const ctx = context();

    void byId(boardCommands(ctx), 'card:a').run?.();

    expect(ctx.openCard).toHaveBeenCalledWith('a');
  });

  it('offers the other views, not the one already shown', () => {
    const ids = boardCommands(context({ currentView: 'canvas' })).map((item) => item.id);

    expect(ids).toContain('view:board');
    expect(ids).not.toContain('view:canvas');
  });

  it('adds a card in two steps: which list, then the title', async () => {
    const ctx = context();
    const add = byId(boardCommands(ctx), 'create:card');

    expect(add.steps?.map((step) => step.kind)).toEqual(['choose', 'text']);
    const first = add.steps?.[0];
    const listIds = first?.kind === 'choose' ? first.choices().map((choice) => choice.id) : [];
    expect(listIds).toEqual(['todo', 'done']);

    const message = await add.finish?.(['todo', 'Write the docs']);

    expect(ctx.actions.createCard).toHaveBeenCalledWith('todo', 'Write the docs');
    expect(message).toBe('Added “Write the docs” to To do.');
  });

  it('moves a card to the end of another list', async () => {
    const ctx = context();

    const message = await byId(boardCommands(ctx), 'card:move').finish?.(['a', 'done']);

    expect(ctx.actions.moveCard).toHaveBeenCalledWith('a', 'done', 0);
    expect(message).toBe('Moved “Card a” to Done.');
  });

  it('sets a due date from a few words, and clears it with none', async () => {
    const ctx = context();
    const due = byId(boardCommands(ctx), 'card:due');

    await due.finish?.(['a', '2026-03-14']);
    await due.finish?.(['a', 'none']);
    await due.finish?.(['a', '']);

    expect(ctx.actions.setCardDueDate).toHaveBeenNthCalledWith(1, 'a', '2026-03-14');
    expect(ctx.actions.setCardDueDate).toHaveBeenNthCalledWith(2, 'a', null);
    expect(ctx.actions.setCardDueDate).toHaveBeenNthCalledWith(3, 'a', null);
  });

  it('only offers to assign cards that are not already mine, and keeps the other assignees', async () => {
    const ctx = context();
    const assign = byId(boardCommands(ctx), 'card:assign-me');
    const step = assign.steps?.[0];
    const offered = step?.kind === 'choose' ? step.choices().map((choice) => choice.id) : [];

    expect(offered).toEqual(['a']);

    await assign.finish?.(['a']);
    expect(ctx.actions.setCardAssignees).toHaveBeenCalledWith('a', ['me']);
  });

  it('sends the destructive ones through the existing confirmations', async () => {
    const ctx = context();
    const commands = boardCommands(ctx);

    await byId(commands, 'panel:delete').finish?.(['done']);
    void byId(commands, 'board:delete').run?.();

    expect(ctx.askDelete).toHaveBeenCalledWith('done');
    expect(ctx.askDeleteBoard).toHaveBeenCalled();
  });

  it('offers the position form only on the canvas', () => {
    expect(boardCommands(context()).map((item) => item.id)).not.toContain('panel:position');
    expect(boardCommands(context({ currentView: 'canvas' })).map((item) => item.id)).toContain(
      'panel:position'
    );
  });

  it('offers block settings only for blocks', () => {
    const settings = byId(boardCommands(context()), 'block:settings');
    const step = settings.steps?.[0];

    expect(step?.kind === 'choose' ? step.choices().map((choice) => choice.id) : []).toEqual([
      'note',
    ]);
  });

  it('offers nothing that changes the board to someone who can only look', () => {
    const ids = boardCommands(context({ editable: false })).map((item) => item.id);

    expect(ids).not.toContain('create:card');
    expect(ids).not.toContain('card:move');
    expect(ids).not.toContain('board:fit');
    expect(ids).toContain('card:a');
    expect(ids).toContain('board:members');
  });

  it('only offers to delete the board to someone who may manage it', () => {
    expect(boardCommands(context({ canManage: false })).map((item) => item.id)).not.toContain(
      'board:delete'
    );
  });

  it('offers a way out of filters once one is on', () => {
    const on = boardCommands(context({ filter: { ...EMPTY_FILTER, mine: true } }));

    expect(byId(on, 'filter:clear').suggested).toBe(true);
    expect(boardCommands(context()).map((item) => item.id)).not.toContain('filter:clear');
  });
});
