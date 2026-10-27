import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BoardMetaProvider } from '@hooks/useBoardMeta';
import type { BoardList, CardSummary } from '@lib/boardsApi';

import { AgendaBlock } from './AgendaBlock';
import { CalendarBlock } from './CalendarBlock';
import { ChartBlock } from './ChartBlock';
import { CounterBlock } from './CounterBlock';
import { NoteBlock } from './NoteBlock';
import { OverdueBlock } from './OverdueBlock';
import { ProgressBlock } from './ProgressBlock';
import { SnippetBlock } from './SnippetBlock';
import { TableBlock } from './TableBlock';

function card(id: string, due: string | null, extra: Partial<CardSummary> = {}): CardSummary {
  return {
    id,
    list_id: 'doing',
    title: `Card ${id}`,
    has_description: false,
    description_preview: '',
    label_ids: [],
    assignee_ids: [],
    due_date: due,
    ...extra,
  };
}

const panels: BoardList[] = [
  {
    id: 'doing',
    name: 'Doing',
    wip_limit: null,
    kind: 'list',
    config: {},
    cards: [
      card('late', '2026-10-20'),
      card('today', '2026-10-22', { assignee_ids: ['me'] }),
      card('soon', '2026-10-24'),
      card('none', null),
    ],
  },
  {
    id: 'done',
    name: 'Done',
    wip_limit: null,
    kind: 'list',
    config: {},
    cards: [card('d1', null)],
  },
];

function inBoard(ui: React.ReactNode) {
  return render(
    <BoardMetaProvider members={[]} meId="me" today="2026-10-22">
      {ui}
    </BoardMetaProvider>
  );
}

function block(kind: BoardList['kind'], config: BoardList['config']): BoardList {
  return { id: 'blk', name: 'Block', wip_limit: null, kind, config, cards: [] };
}

describe('CalendarBlock', () => {
  it('is a grid with one tab stop, and says how many cards each day has', () => {
    inBoard(<CalendarBlock panels={panels} onOpenCard={vi.fn()} />);

    expect(screen.getByRole('grid')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(7);
    expect(screen.getAllByRole('gridcell').filter((cell) => cell.tabIndex === 0)).toHaveLength(1);
    expect(screen.getByRole('gridcell', { name: /today, 1 card due/ })).toBeInTheDocument();
  });

  it('lists the cards of the chosen day and opens them', () => {
    const onOpenCard = vi.fn();
    inBoard(<CalendarBlock panels={panels} onOpenCard={onOpenCard} />);

    fireEvent.click(screen.getByRole('button', { name: 'Card today' }));

    expect(onOpenCard).toHaveBeenCalledWith('today');
  });

  it('moves with the arrow keys and picks a day with Enter', () => {
    const onOpenCard = vi.fn();
    inBoard(<CalendarBlock panels={panels} onOpenCard={onOpenCard} />);
    const today = screen.getByRole('gridcell', { name: /today/ });

    fireEvent.keyDown(today, { key: 'ArrowRight' });
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowRight' });
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Enter' });

    expect(screen.getByRole('button', { name: 'Card soon' })).toBeInTheDocument();
  });

  it('changes month with the buttons', () => {
    inBoard(<CalendarBlock panels={panels} onOpenCard={vi.fn()} />);
    const title = screen.getByRole('heading', { level: 3 }).textContent;

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));

    expect(screen.getByRole('heading', { level: 3 }).textContent).not.toBe(title);
  });

  it('says so when nothing is due', () => {
    inBoard(<CalendarBlock panels={[]} onOpenCard={vi.fn()} />);

    expect(screen.getByText('Nothing due.')).toBeInTheDocument();
  });
});

describe('AgendaBlock', () => {
  it('shows what is late first, then each day', () => {
    inBoard(<AgendaBlock block={block('agenda', {})} panels={panels} onOpenCard={vi.fn()} />);

    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings[0]).toContain('Overdue');
    expect(headings[1]).toContain('Today');
    expect(screen.getByRole('status')).toHaveTextContent('3 cards due in the next 7 days.');
  });

  it('opens a card', () => {
    const onOpenCard = vi.fn();
    inBoard(<AgendaBlock block={block('agenda', {})} panels={panels} onOpenCard={onOpenCard} />);

    fireEvent.click(screen.getByRole('button', { name: /Card soon/ }));

    expect(onOpenCard).toHaveBeenCalledWith('soon');
  });

  it('looks only at today, and only at my cards, when asked', () => {
    inBoard(
      <AgendaBlock
        block={block('agenda', { range: 'today', mine_only: true, size: 'normal' })}
        panels={panels}
        onOpenCard={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Card today/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Card soon/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Card late/ })).not.toBeInTheDocument();
  });

  it('says that nothing is due, as good news', () => {
    inBoard(<AgendaBlock block={block('agenda', {})} panels={[]} onOpenCard={vi.fn()} />);

    expect(screen.getByText('Nothing due')).toBeInTheDocument();
    expect(screen.getByText(/No cards are due in the next 7 days/)).toBeInTheDocument();
  });
});

describe('NoteBlock', () => {
  it('draws the note as Markdown, and keeps raw HTML as text', async () => {
    inBoard(<NoteBlock text={'# Plan\n\n<b>second</b>'} editable={false} onSave={vi.fn()} />);

    expect(await screen.findByRole('heading', { level: 3, name: 'Plan' })).toBeInTheDocument();
    expect(screen.getByText(/<b>second<\/b>/)).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
  });

  it('offers no editing to people who cannot edit', () => {
    inBoard(<NoteBlock text="" editable={false} onSave={vi.fn()} />);

    expect(screen.getByText('This note is empty.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('edits and saves with the button, or with Ctrl and Enter', async () => {
    const onSave = vi.fn();
    inBoard(<NoteBlock text="Old" editable onSave={onSave} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit note' }));
    fireEvent.change(screen.getByLabelText('Note text'), { target: { value: 'New words' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith('New words');

    fireEvent.click(await screen.findByRole('button', { name: 'Edit note' }));
    fireEvent.change(screen.getByLabelText('Note text'), { target: { value: 'Again' } });
    fireEvent.keyDown(screen.getByLabelText('Note text'), { key: 'Enter', ctrlKey: true });
    expect(onSave).toHaveBeenLastCalledWith('Again');
  });

  it('cancels with Escape, keeping the text', async () => {
    const onSave = vi.fn();
    inBoard(<NoteBlock text="Keep" editable onSave={onSave} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit note' }));
    fireEvent.change(screen.getByLabelText('Note text'), { target: { value: 'Lost' } });
    fireEvent.keyDown(screen.getByLabelText('Note text'), { key: 'Escape' });

    expect(onSave).not.toHaveBeenCalled();
    expect(await screen.findByText('Keep')).toBeInTheDocument();
  });

  it('does not save when nothing changed', async () => {
    const onSave = vi.fn();
    inBoard(<NoteBlock text="Same" editable onSave={onSave} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit note' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).not.toHaveBeenCalled();
  });

  it('invites a first note', () => {
    inBoard(<NoteBlock text="" editable onSave={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Write a note' }));

    expect(screen.getByLabelText('Note text')).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Formatting' })).toBeInTheDocument();
  });

  it('ticks a checklist box from the note and saves it, for people who can edit', async () => {
    const onSave = vi.fn();
    inBoard(<NoteBlock text={'- [ ] buy tape\n- [x] book room'} editable onSave={onSave} />);

    fireEvent.click(await screen.findByRole('checkbox', { name: /buy tape/ }));

    expect(onSave).toHaveBeenCalledWith('- [x] buy tape\n- [x] book room');
  });

  it('shows the boxes of a checklist but leaves them alone for people who cannot edit', async () => {
    inBoard(<NoteBlock text="- [ ] buy tape" editable={false} onSave={vi.fn()} />);

    expect(await screen.findByRole('checkbox', { name: /buy tape/ })).toBeDisabled();
  });
});

describe('CounterBlock', () => {
  it('reads the counter as one sentence for a screen reader', () => {
    inBoard(<CounterBlock block={block('counter', { metric: 'overdue' })} panels={panels} />);

    expect(screen.getByText(/Overdue cards: 1\. Past their due date\./)).toBeInTheDocument();
  });

  it('shows the share done with a bar and the detail', () => {
    const { container } = inBoard(
      <CounterBlock
        block={block('counter', { metric: 'done_percent', done_list_id: 'done' })}
        panels={panels}
      />
    );

    expect(screen.getByText(/Done: 20 percent/)).toBeInTheDocument();
    expect(container.querySelector('.counter-block__bar span')).toHaveStyle({ width: '20%' });
    expect(screen.getByText('1 of 5 cards in Done')).toBeInTheDocument();
  });

  it('asks for a list when none is chosen', () => {
    inBoard(<CounterBlock block={block('counter', { metric: 'done_percent' })} panels={panels} />);

    expect(screen.getByText(/Choose the list that means done/)).toBeInTheDocument();
  });

  it('counts the days left with the name the person gave', () => {
    inBoard(
      <CounterBlock
        block={block('counter', {
          metric: 'days_left',
          date: '2026-11-05',
          label: 'Days to launch',
        })}
        panels={panels}
      />
    );

    expect(screen.getByText(/Days to launch: 14 days left/)).toBeInTheDocument();
  });

  it('works when the settings are empty, with the defaults', () => {
    inBoard(<CounterBlock block={block('counter', {})} panels={panels} />);

    expect(screen.getByText(/Overdue cards: 1/)).toBeInTheDocument();
  });

  it('shows a calm count for everything', () => {
    inBoard(<CounterBlock block={block('counter', { metric: 'total_cards' })} panels={panels} />);

    expect(within(document.body).getByText(/Cards: 5/)).toBeInTheDocument();
  });
});

describe('ProgressBlock', () => {
  it('draws a ring and says the same thing in words', () => {
    inBoard(
      <ProgressBlock
        block={block('progress', { style: 'ring', label: 'Sprint 12', done_list_id: 'done' })}
        panels={panels}
      />
    );

    const meter = screen.getByRole('progressbar', { name: 'Sprint 12' });
    expect(meter).toHaveAttribute('aria-valuenow', '20');
    expect(meter).toHaveAttribute('aria-valuetext', 'Sprint 12: 20 percent. 1 of 5 cards in Done.');
    expect(document.querySelector('.progress-block__ring')).not.toBeNull();
    expect(screen.getByText('1 of 5 cards in Done')).toBeInTheDocument();
  });

  it('can be a bar', () => {
    inBoard(
      <ProgressBlock
        block={block('progress', { style: 'bar', done_list_id: 'done' })}
        panels={panels}
      />
    );

    expect(document.querySelector('.progress-block__bar')).not.toBeNull();
    expect(document.querySelector('.progress-block__ring')).toBeNull();
    expect(screen.getByRole('progressbar', { name: 'Done' })).toBeInTheDocument();
  });

  it('asks for a list instead of a false zero when none is chosen', () => {
    inBoard(<ProgressBlock block={block('progress', {})} panels={panels} />);

    const meter = screen.getByRole('progressbar');
    expect(meter).not.toHaveAttribute('aria-valuenow');
    expect(screen.getByText(/Choose the list that means done/)).toBeInTheDocument();
  });
});

describe('TableBlock', () => {
  const rows = [
    ['Item', 'Cost'],
    ['Rent', '800'],
    ['Food', '120,5'],
  ];

  function table(onSave = vi.fn(), editable = true, config: Record<string, unknown> = {}) {
    inBoard(
      <TableBlock
        block={{
          ...block('table', { size: 'wide', header: true, rows, ...config }),
          name: 'Budget',
        }}
        editable={editable}
        onSave={onSave}
      />
    );
    return onSave;
  }

  function focusOn(cell: HTMLElement) {
    act(() => cell.focus());
  }

  it('is a grid with a heading row, one tab stop and a total for the number columns', () => {
    table();

    expect(screen.getByRole('grid', { name: 'Budget' })).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Item',
      'Cost',
    ]);
    const cells = [...screen.getAllByRole('columnheader'), ...screen.getAllByRole('gridcell')];
    expect(cells.filter((cell) => cell.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect(screen.getByRole('columnheader', { name: 'Item' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByText(/Total:/)).toBeInTheDocument();
  });

  it('moves with the arrow keys and keeps a single tab stop', () => {
    table();
    const first = screen.getByRole('columnheader', { name: 'Item' });
    focusOn(first);

    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(screen.getByRole('gridcell', { name: 'Rent' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('gridcell', { name: 'Rent' }), { key: 'ArrowRight' });
    expect(screen.getByRole('gridcell', { name: '800' })).toHaveFocus();
    expect(screen.getByRole('gridcell', { name: '800' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('gridcell', { name: 'Rent' })).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(screen.getByRole('gridcell', { name: '800' }), { key: 'End', ctrlKey: true });
    expect(screen.getByRole('gridcell', { name: '120,5' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('gridcell', { name: '120,5' }), {
      key: 'Home',
      ctrlKey: true,
    });
    expect(screen.getByRole('columnheader', { name: 'Item' })).toHaveFocus();
  });

  it('edits a cell with Enter, saves on Enter and moves down', () => {
    const onSave = table();
    const cell = screen.getByRole('gridcell', { name: 'Rent' });
    focusOn(cell);

    fireEvent.keyDown(cell, { key: 'Enter' });
    const input = screen.getByRole('textbox', { name: 'Cell A2' });
    fireEvent.change(input, { target: { value: 'Rent and bills' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSave).toHaveBeenCalledWith('blk', {
      size: 'wide',
      header: true,
      rows: [
        ['Item', 'Cost'],
        ['Rent and bills', '800'],
        ['Food', '120,5'],
      ],
    });
    expect(screen.getByRole('gridcell', { name: 'Food' })).toHaveFocus();
  });

  it('puts the cell back on Escape and saves nothing when nothing changed', () => {
    const onSave = table();
    const cell = screen.getByRole('gridcell', { name: 'Rent' });
    focusOn(cell);

    fireEvent.keyDown(cell, { key: 'Enter' });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Changed' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('gridcell', { name: 'Rent' })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('gridcell', { name: 'Rent' }), { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('starts typing over a cell and clears one with Delete', () => {
    const onSave = table();
    const cell = screen.getByRole('gridcell', { name: 'Rent' });
    focusOn(cell);

    fireEvent.keyDown(cell, { key: 'Delete' });
    expect(onSave).toHaveBeenLastCalledWith(
      'blk',
      expect.objectContaining({ rows: [rows[0], ['', '800'], rows[2]] })
    );

    fireEvent.keyDown(cell, { key: 'x' });
    expect(screen.getByRole('textbox', { name: 'Cell A2' })).toHaveValue('x');
  });

  it('fills the grid from cells pasted from a spreadsheet', () => {
    const onSave = table();
    const cell = screen.getByRole('gridcell', { name: 'Rent' });
    focusOn(cell);

    fireEvent.paste(screen.getByRole('grid'), {
      clipboardData: { getData: () => 'Gym\t30\nBooks\t15' },
    });

    expect(onSave).toHaveBeenCalledWith(
      'blk',
      expect.objectContaining({
        rows: [
          ['Item', 'Cost'],
          ['Gym', '30'],
          ['Books', '15'],
        ],
      })
    );
  });

  it('adds and removes rows and columns from the toolbar', () => {
    const onSave = table();
    focusOn(screen.getByRole('gridcell', { name: 'Rent' }));

    fireEvent.click(screen.getByRole('button', { name: /^Row$/ }));
    expect(onSave).toHaveBeenLastCalledWith(
      'blk',
      expect.objectContaining({ rows: [rows[0], rows[1], ['', ''], rows[2]] })
    );

    fireEvent.click(screen.getByRole('button', { name: /Column$/ }));
    expect(onSave.mock.calls.at(-1)?.[1].rows[0]).toHaveLength(3);
  });

  it('can be read but not changed by a reader', () => {
    const onSave = table(vi.fn(), false);
    const cell = screen.getByRole('gridcell', { name: 'Rent' });
    focusOn(cell);

    fireEvent.keyDown(cell, { key: 'Enter' });
    fireEvent.keyDown(cell, { key: 'Delete' });
    fireEvent.paste(screen.getByRole('grid'), { clipboardData: { getData: () => 'x' } });

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('gridcell', { name: 'Rent' })).toHaveAttribute('aria-readonly', 'true');
  });

  it('offers to start an empty table', () => {
    const onSave = vi.fn();
    inBoard(<TableBlock block={block('table', { rows: [] })} editable onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /Add a cell/ }));

    expect(onSave).toHaveBeenCalledWith('blk', expect.objectContaining({ rows: [['']] }));
  });
});

describe('SnippetBlock', () => {
  const code = 'SELECT *\nFROM cards;\n<b>not markup</b>';

  it('shows the code as text with its file name, line numbers and a copy button', async () => {
    inBoard(
      <SnippetBlock
        block={block('snippet', {
          language: 'sql',
          filename: 'cards.sql',
          code,
          line_numbers: true,
        })}
        editable
        onAddCode={vi.fn()}
      />
    );

    expect(screen.getByRole('region', { name: 'Code, cards.sql' })).toBeInTheDocument();
    expect(screen.getByText('cards.sql')).toBeInTheDocument();
    expect(document.querySelector('.rt-code__gutter')).toHaveTextContent('1 2 3');
    expect(document.querySelector('.rt-code__gutter')).toHaveAttribute('aria-hidden', 'true');
    expect(await screen.findByRole('button', { name: /Copy/ })).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
  });

  it('has no line numbers unless asked', () => {
    inBoard(
      <SnippetBlock
        block={block('snippet', { language: 'text', code: 'ls -la' })}
        editable
        onAddCode={vi.fn()}
      />
    );

    expect(document.querySelector('.rt-code__gutter')).toBeNull();
    expect(screen.getByRole('region', { name: 'Code, text' })).toBeInTheDocument();
  });

  it('invites a writer to add code and tells a reader nothing to press', () => {
    const onAddCode = vi.fn();
    const empty = block('snippet', {});
    const { unmount } = inBoard(<SnippetBlock block={empty} editable onAddCode={onAddCode} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add code' }));
    expect(onAddCode).toHaveBeenCalledWith('blk');
    unmount();

    inBoard(<SnippetBlock block={empty} editable={false} onAddCode={onAddCode} />);
    expect(screen.getByText('No code yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add code' })).toBeNull();
  });
});

describe('ChartBlock', () => {
  it('draws bars that are hidden from assistive tech, with the data in a table instead', () => {
    inBoard(<ChartBlock block={block('chart', { source: 'list' })} panels={panels} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Cards by list, 5 cards: Doing 4, Done 1.'
    );
    expect(document.querySelector('.chart-block__bars')).toHaveAttribute('aria-hidden', 'true');
    const table = screen.getByRole('table', { name: 'Cards by list' });
    expect(within(table).getByRole('rowheader', { name: 'Doing' })).toBeInTheDocument();
    expect(within(table).getByText('80%')).toBeInTheDocument();
  });

  it('swaps the drawing for a visible table and back', () => {
    inBoard(<ChartBlock block={block('chart', { source: 'list' })} panels={panels} />);

    const toggle = screen.getByRole('button', { name: 'Show table' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);

    expect(document.querySelector('.chart-block__bars')).toBeNull();
    expect(document.querySelector('.chart-block__table')).not.toHaveClass('sr-only');
    expect(screen.getByRole('button', { name: 'Show chart' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('can be a donut with a legend and the total in the middle', () => {
    inBoard(
      <ChartBlock block={block('chart', { source: 'list', style: 'donut' })} panels={panels} />
    );

    expect(document.querySelectorAll('.chart-block__segment')).toHaveLength(2);
    expect(document.querySelector('.chart-block__total')).toHaveTextContent('5');
    expect(document.querySelectorAll('.chart-block__legend li')).toHaveLength(2);
  });

  it('says there is nothing to chart on a board with no cards', () => {
    inBoard(<ChartBlock block={block('chart', {})} panels={[]} />);

    expect(screen.getByText('Nothing to chart yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('OverdueBlock', () => {
  const lateCards = (count: number): BoardList[] => [
    {
      id: 'doing',
      name: 'Doing',
      wip_limit: null,
      kind: 'list',
      config: {},
      cards: Array.from({ length: count }, (_, index) =>
        card(`c${index}`, `2026-10-${String(20 - index).padStart(2, '0')}`, {
          assignee_ids: ['me'],
          title: `Fix ${index}`,
        })
      ),
    },
  ];

  it('lists my late cards with how late they are and opens one', () => {
    const onOpenCard = vi.fn();
    inBoard(<OverdueBlock panels={lateCards(2)} onOpenCard={onOpenCard} />);

    expect(screen.getByRole('status')).toHaveTextContent('2 of your cards are late.');
    expect(screen.getByText('2 days late')).toBeInTheDocument();
    expect(screen.getByText('3 days late')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Fix 0/ }));

    expect(onOpenCard).toHaveBeenCalledWith('c0');
  });

  it('shows five at first and the rest on request', () => {
    inBoard(<OverdueBlock panels={lateCards(8)} onOpenCard={vi.fn()} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    const more = screen.getByRole('button', { name: 'Show 3 more' });
    expect(more).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(more);

    expect(screen.getAllByRole('listitem')).toHaveLength(8);
    expect(screen.getByRole('button', { name: 'Show fewer' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('says calmly that nothing is late', () => {
    inBoard(<OverdueBlock panels={panels} onOpenCard={vi.fn()} />);

    expect(screen.getByText('Nothing is late')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).toBeNull();
  });
});
