import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BoardMetaProvider } from '@hooks/useBoardMeta';
import type { BoardList, CardSummary } from '@lib/boardsApi';

import { sampleBoardView } from '../../../test/fixtures';
import { BoardTable } from './BoardTable';

function card(id: string, title: string, extra: Partial<CardSummary> = {}): CardSummary {
  return {
    id,
    list_id: 'todo',
    title,
    has_description: false,
    description_preview: '',
    label_ids: [],
    assignee_ids: [],
    due_date: null,
    ...extra,
  };
}

const lists: BoardList[] = [
  {
    id: 'todo',
    name: 'To do',
    wip_limit: null,
    kind: 'list',
    config: {},
    cards: [
      card('a', 'Banana', { due_date: '2026-11-02', label_ids: ['low'] }),
      card('b', 'Apple', { label_ids: ['urgent'], assignee_ids: ['u-wen'] }),
      card('c', 'Cherry', { due_date: '2026-10-30' }),
    ],
  },
  { id: 'done', name: 'Done', wip_limit: null, kind: 'list', config: {}, cards: [] },
];

function setup(props: Partial<React.ComponentProps<typeof BoardTable>> = {}) {
  const view = sampleBoardView();
  const onOpenCard = vi.fn();
  const onMoveCard = vi.fn();
  render(
    <BoardMetaProvider members={view.members} meId="u-me" today="2026-10-22">
      <BoardTable
        boardName="Roadmap"
        lists={lists}
        labels={view.labels}
        members={view.members}
        matches={() => true}
        freshIds={[]}
        editable
        onOpenCard={onOpenCard}
        onMoveCard={onMoveCard}
        {...props}
      />
    </BoardMetaProvider>
  );
  return { onOpenCard, onMoveCard };
}

function titles(): string[] {
  return screen
    .getAllByRole('rowheader')
    .map((header) => within(header).getByRole('button').textContent ?? '');
}

describe('BoardTable', () => {
  it('lists every card with its list, labels, people and due date', () => {
    setup();

    expect(titles()).toEqual(['Banana', 'Apple', 'Cherry']);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Roadmap as a table' })).toHaveAttribute(
      'tabindex',
      '0'
    );
    expect(screen.getByText('Urgent')).toBeInTheDocument();
    expect(screen.getAllByText(/Due soon|Due|Overdue/).length).toBeGreaterThan(0);
  });

  it('opens a card from its title', () => {
    const { onOpenCard } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Cherry' }));

    expect(onOpenCard).toHaveBeenCalledWith('c');
  });

  it('sorts from a real button in the header and says which column is sorted', () => {
    setup();
    const title = screen.getByRole('button', { name: /^Card/ });
    const header = title.closest('th');

    expect(header).not.toHaveAttribute('aria-sort');

    fireEvent.click(title);
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    expect(titles()).toEqual(['Apple', 'Banana', 'Cherry']);

    fireEvent.click(title);
    expect(header).toHaveAttribute('aria-sort', 'descending');
    expect(titles()).toEqual(['Cherry', 'Banana', 'Apple']);

    fireEvent.click(title);
    expect(header).not.toHaveAttribute('aria-sort');
    expect(titles()).toEqual(['Banana', 'Apple', 'Cherry']);
  });

  it('marks only one column as sorted at a time', () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: /^Card/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Due date/ }));

    const sorted = screen
      .getAllByRole('columnheader')
      .filter((header) => header.hasAttribute('aria-sort'));
    expect(sorted).toHaveLength(1);
    expect(sorted[0]).toHaveTextContent('Due date');
    expect(titles()).toEqual(['Cherry', 'Banana', 'Apple']);
  });

  it('leaves out the cards the filter hides', () => {
    setup({ matches: (candidate) => candidate.title !== 'Banana' });

    expect(titles()).toEqual(['Apple', 'Cherry']);
  });

  it('says so when the filter hides every card', () => {
    setup({ matches: () => false });

    expect(screen.getByText('No card matches the filter.')).toBeInTheDocument();
  });

  it('moves a card to another list without dragging', () => {
    const { onMoveCard } = setup();

    fireEvent.change(screen.getByLabelText('List for Banana'), { target: { value: 'done' } });

    expect(onMoveCard).toHaveBeenCalledWith('a', 'done', 0);
  });

  it('only shows the list, as text, to people who cannot edit', () => {
    setup({ editable: false });

    expect(screen.queryByLabelText('List for Banana')).not.toBeInTheDocument();
    expect(screen.getAllByText('To do').length).toBeGreaterThan(0);
  });

  it('invites the first card when there are none', () => {
    setup({
      lists: [{ id: 'todo', name: 'To do', wip_limit: null, kind: 'list', config: {}, cards: [] }],
    });

    expect(screen.getByText('No cards yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
