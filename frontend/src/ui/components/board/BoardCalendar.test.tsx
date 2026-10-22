import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BoardMetaProvider } from '@hooks/useBoardMeta';
import type { BoardList, CardSummary } from '@lib/boardsApi';

import { sampleBoardView } from '../../../test/fixtures';
import { BoardCalendar } from './BoardCalendar';

function card(id: string, title: string, due: string | null): CardSummary {
  return {
    id,
    list_id: 'todo',
    title,
    has_description: false,
    description_preview: '',
    label_ids: [],
    assignee_ids: [],
    due_date: due,
  };
}

const lists: BoardList[] = [
  {
    id: 'todo',
    name: 'To do',
    wip_limit: null,
    cards: [
      card('a', 'Write the post', '2026-10-22'),
      card('b', 'Fix the bug', '2026-10-22'),
      card('c', 'Plan the demo', '2026-10-30'),
      card('d', 'Someday', null),
    ],
  },
];

function setup(props: Partial<React.ComponentProps<typeof BoardCalendar>> = {}) {
  const view = sampleBoardView();
  const onOpenCard = vi.fn();
  const onSetDueDate = vi.fn();
  render(
    <BoardMetaProvider members={view.members} meId="u-me" today="2026-10-22">
      <BoardCalendar
        lists={lists}
        labels={view.labels}
        members={view.members}
        matches={() => true}
        editable
        onOpenCard={onOpenCard}
        onSetDueDate={onSetDueDate}
        {...props}
      />
    </BoardMetaProvider>
  );
  return { onOpenCard, onSetDueDate };
}

/** Cells are found by their ISO day, since the wording of dates follows the viewer's language. */
function cellFor(day: string): HTMLElement {
  const cell = document.querySelector<HTMLElement>(`[role="gridcell"][data-day="${day}"]`);
  if (!cell) throw new Error(`No cell for ${day}`);
  return cell;
}

describe('BoardCalendar', () => {
  it('draws the month as a grid with a column for each weekday', () => {
    setup();

    expect(screen.getByRole('grid')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(7);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/2026/);
  });

  it('says in words how many cards are due on a day, and which day is today', () => {
    setup();

    expect(cellFor('2026-10-22')).toHaveAccessibleName(expect.stringMatching(/today, 2 cards due/));
    expect(cellFor('2026-10-30')).toHaveAccessibleName(expect.stringMatching(/1 card due/));
    expect(cellFor('2026-10-25')).toHaveAccessibleName(expect.stringMatching(/no cards due/));
  });

  it('is one tab stop, and arrow keys move it between days', () => {
    setup();
    const cells = screen.getAllByRole('gridcell');

    expect(cells.filter((cell) => cell.tabIndex === 0)).toHaveLength(1);
    const today = cellFor('2026-10-22');
    expect(today).toHaveAttribute('tabindex', '0');

    today.focus();
    fireEvent.keyDown(today, { key: 'ArrowRight' });

    expect(cellFor('2026-10-23')).toHaveAttribute('tabindex', '0');
    expect(cellFor('2026-10-22')).toHaveAttribute('tabindex', '-1');
    expect(cellFor('2026-10-23')).toHaveFocus();

    fireEvent.keyDown(cellFor('2026-10-23'), { key: 'ArrowDown' });
    expect(cellFor('2026-10-30')).toHaveFocus();
  });

  it('changes month with Page Down, and the title follows', () => {
    setup();
    const before = screen.getByRole('heading', { level: 2 }).textContent;

    fireEvent.keyDown(cellFor('2026-10-22'), { key: 'PageDown' });

    expect(screen.getByRole('heading', { level: 2 }).textContent).not.toBe(before);
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/2026/);
    expect(cellFor('2026-11-22')).toHaveAttribute('tabindex', '0');
  });

  it('changes month with the buttons and comes back with Today', () => {
    setup();
    const title = screen.getByRole('heading', { level: 2 }).textContent;

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('heading', { level: 2 }).textContent).not.toBe(title);

    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(title);
  });

  it('lists the cards of the picked day beside the grid, and opens them from there', () => {
    const { onOpenCard } = setup();

    fireEvent.click(cellFor('2026-10-30'));

    const side = screen.getByRole('complementary');
    expect(within(side).getByRole('heading', { level: 3, name: /30/ })).toBeInTheDocument();
    fireEvent.click(within(side).getByRole('button', { name: /^Plan the demo/ }));
    expect(onOpenCard).toHaveBeenCalledWith('c');
  });

  it('picks a day with Enter', () => {
    setup();
    const day = cellFor('2026-10-30');

    fireEvent.keyDown(day, { key: 'Enter' });

    expect(day).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { level: 3, name: /30/ })).toBeInTheDocument();
  });

  it('keeps cards without a date in a tray, each with a button that gives it the chosen day', () => {
    const { onSetDueDate } = setup();

    fireEvent.click(cellFor('2026-10-30'));
    const tray = screen.getByRole('region', { name: /No due date/ });
    expect(within(tray).getByText('Someday')).toBeInTheDocument();
    fireEvent.click(within(tray).getByRole('button', { name: /^Due/ }));

    expect(onSetDueDate).toHaveBeenCalledWith('d', '2026-10-30');
  });

  it('takes a date off a card', () => {
    const { onSetDueDate } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Remove the due date of Fix the bug' }));

    expect(onSetDueDate).toHaveBeenCalledWith('b', null);
  });

  it('does not offer to change dates to people who cannot edit', () => {
    setup({ editable: false });

    expect(screen.queryByRole('button', { name: /Remove the due date/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Due/ })).not.toBeInTheDocument();
    expect(screen.getByText('Someday')).toBeInTheDocument();
  });

  it('leaves out the cards the filter hides', () => {
    setup({ matches: (candidate) => candidate.id !== 'a' });

    expect(cellFor('2026-10-22')).toHaveAccessibleName(expect.stringMatching(/1 card due/));
    expect(screen.queryByText('Write the post')).not.toBeInTheDocument();
  });
});
