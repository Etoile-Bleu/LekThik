import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BoardMetaProvider } from '@hooks/useBoardMeta';
import { useAnnouncer } from '@lib/announcer';
import type { BoardList as BoardListData, CardSummary } from '@lib/boardsApi';

import { BoardList } from './BoardList';

function card(id: string): CardSummary {
  return {
    id,
    list_id: 'doing',
    title: `Card ${id}`,
    has_description: false,
    description_preview: '',
    label_ids: [],
    assignee_ids: [],
    due_date: null,
  };
}

function listWith(count: number, limit: number | null): BoardListData {
  return {
    id: 'doing',
    name: 'Doing',
    wip_limit: limit,
    kind: 'list',
    config: {},
    cards: Array.from({ length: count }, (_, index) => card(String(index))),
  };
}

function renderList(
  list: BoardListData,
  props: Partial<React.ComponentProps<typeof BoardList>> = {}
) {
  const handlers = {
    onToggleCollapsed: vi.fn(),
    onEditLimit: vi.fn(),
    onRename: vi.fn(),
    onMove: vi.fn(),
    onDelete: vi.fn(),
    onAddCard: vi.fn().mockResolvedValue(undefined),
    onOpenCard: vi.fn(),
  };
  const ui = (current: BoardListData, collapsed = false) => (
    <MemoryWrapper>
      <BoardList
        list={current}
        index={0}
        total={1}
        labelsById={new Map()}
        matches={() => true}
        freshIds={[]}
        collapsed={collapsed}
        {...handlers}
        {...props}
      />
    </MemoryWrapper>
  );
  const view = render(ui(list, props.collapsed));
  return {
    ...handlers,
    rerender: (current: BoardListData, collapsed = false) => view.rerender(ui(current, collapsed)),
  };
}

function MemoryWrapper({ children }: { children: React.ReactNode }) {
  return (
    <BoardMetaProvider members={[]} meId={undefined} today="2026-10-22">
      <DndContext>
        <SortableContext items={['doing']}>{children}</SortableContext>
      </DndContext>
    </BoardMetaProvider>
  );
}

describe('BoardList limits and folding', () => {
  beforeEach(() => {
    useAnnouncer.setState({ message: '', tick: 0 });
  });

  it('shows a plain count when there is no limit', () => {
    renderList(listWith(2, null));

    expect(screen.getByText('2 cards')).toHaveClass('sr-only');
    expect(screen.queryByText(/over the limit/)).not.toBeInTheDocument();
  });

  it('shows the count against the limit and says it in words', () => {
    renderList(listWith(2, 4));

    expect(screen.getByText('2 cards, limit 4').closest('.board-list__count')).toHaveTextContent(
      '2/4'
    );
  });

  it('warns in words, not only colour, when the list is over its limit', () => {
    renderList(listWith(5, 3));

    expect(
      screen.getByText('5 cards, limit 3, 2 over the limit').closest('.board-list__count')
    ).toHaveAttribute('data-limit', 'over');
    expect(screen.getByText('2 over the limit of 3')).toBeInTheDocument();
  });

  it('marks a list that sits exactly at its limit without calling it over', () => {
    renderList(listWith(3, 3));

    expect(
      screen.getByText('3 cards, at the limit of 3').closest('.board-list__count')
    ).toHaveAttribute('data-limit', 'at');
    expect(screen.queryByText(/over the limit of/)).not.toBeInTheDocument();
  });

  it('announces when a list crosses its limit, but not when it opens already over', () => {
    const { rerender } = renderList(listWith(3, 3));
    expect(useAnnouncer.getState().message).toBe('');

    rerender(listWith(4, 3));

    expect(useAnnouncer.getState().message).toContain('Doing is over its limit');
  });

  it('stays quiet when it opens already over the limit', () => {
    renderList(listWith(5, 3));

    expect(useAnnouncer.getState().message).toBe('');
  });

  it('folds with a button that says what it will do', () => {
    const { onToggleCollapsed } = renderList(listWith(1, null));

    const fold = screen.getByRole('button', { name: 'Collapse list Doing' });
    expect(fold).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(fold);

    expect(onToggleCollapsed).toHaveBeenCalledWith('doing');
  });

  it('becomes a rail that keeps the name and the count and opens again', () => {
    const { onToggleCollapsed } = renderList(listWith(2, 4), { collapsed: true });

    const expand = screen.getByRole('button', { name: /Expand list Doing 2 cards, limit 4/ });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Card 0')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add a card/ })).not.toBeInTheDocument();
    fireEvent.click(expand);

    expect(onToggleCollapsed).toHaveBeenCalledWith('doing');
  });

  it('lets people who cannot edit fold a list, which is only about how they see it', () => {
    renderList(listWith(1, null), { readOnly: true });

    expect(screen.getByRole('button', { name: 'Collapse list Doing' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Actions for list/ })).not.toBeInTheDocument();
  });

  it('offers the limit in the list menu', () => {
    const { onEditLimit } = renderList(listWith(1, null));

    fireEvent.click(screen.getByRole('button', { name: 'Actions for list Doing' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Set a card limit/ }));

    expect(onEditLimit).toHaveBeenCalledWith('doing');
  });

  it('words the menu item as a change when a limit is already set', () => {
    renderList(listWith(1, 4));

    fireEvent.click(screen.getByRole('button', { name: 'Actions for list Doing' }));

    expect(screen.getByRole('menuitem', { name: /Change the card limit/ })).toBeInTheDocument();
  });
});
