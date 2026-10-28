import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { BoardList } from '@lib/boardsApi';

import { AddBlockDialog } from './AddBlockDialog';
import { BlockSettingsDialog } from './BlockSettingsDialog';

function panel(id: string, name: string, kind: BoardList['kind'], config = {}): BoardList {
  return { id, name, wip_limit: null, kind, config, cards: [] };
}

const panels = [
  panel('todo', 'To do', 'list'),
  panel('done', 'Done', 'list'),
  panel('cal', 'Plan', 'calendar'),
];

describe('AddBlockDialog', () => {
  it('offers every kind of block with what it shows', () => {
    render(<AddBlockDialog open onPick={vi.fn()} onClose={vi.fn()} />);

    for (const name of [
      'Calendar',
      'Agenda',
      'Note',
      'Counter',
      'Progress',
      'My late cards',
      'Chart',
      'Clocks',
      'Timer',
      'Table',
      'Code',
    ]) {
      expect(screen.getByRole('option', { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
    expect(screen.getByRole('option', { name: /^Poll/ })).toBeInTheDocument();
    expect(screen.getAllByText(/A month with a dot on every day/).length).toBeGreaterThan(0);
  });

  it('picks a kind and closes', () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(<AddBlockDialog open onPick={onPick} onClose={onClose} />);

    fireEvent.click(screen.getByRole('option', { name: /^Agenda/ }));

    expect(onPick).toHaveBeenCalledWith('agenda');
    expect(onClose).toHaveBeenCalled();
  });

  it('filters the blocks as you type, by name, description or keyword', () => {
    render(<AddBlockDialog open onPick={vi.fn()} onClose={vi.fn()} />);
    const search = screen.getByRole('combobox', { name: 'Search blocks' });

    fireEvent.change(search, { target: { value: 'vote' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: /^Poll/ })).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'spreadsheet' } });
    expect(screen.getByRole('option', { name: /^Table/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^Poll/ })).not.toBeInTheDocument();
  });

  it('says so when nothing matches', () => {
    render(<AddBlockDialog open onPick={vi.fn()} onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole('combobox', { name: 'Search blocks' }), {
      target: { value: 'zzzz' },
    });

    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByRole('status')).toHaveTextContent(/No block matches/);
  });

  it('moves with the arrow keys and adds with Enter', () => {
    const onPick = vi.fn();
    render(<AddBlockDialog open onPick={onPick} onClose={vi.fn()} />);
    const search = screen.getByRole('combobox', { name: 'Search blocks' });

    expect(screen.getByRole('option', { selected: true })).toHaveTextContent(/^Calendar/);
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { selected: true })).toHaveTextContent(/^Agenda/);
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(onPick).toHaveBeenCalledWith('agenda');
  });
});

describe('BlockSettingsDialog', () => {
  it('changes the lengths of a timer without touching what it is doing', () => {
    const onSave = vi.fn();
    const running = {
      size: 'normal',
      mode: 'focus',
      focus_minutes: 25,
      short_minutes: 5,
      long_minutes: 15,
      state: 'running',
      ends_at_ms: 1_800_000_000_000,
      remaining_ms: null,
      cycle: 2,
    };
    render(
      <BlockSettingsDialog
        block={panel('t', 'Focus', 'timer', running)}
        panels={panels}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('Focus (minutes)'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Long break (minutes)'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith('t', 'timer', {
      ...running,
      focus_minutes: 50,
      long_minutes: 30,
    });
  });

  it('will not save a timer with a length the server would refuse', () => {
    const onSave = vi.fn();
    render(
      <BlockSettingsDialog
        block={panel('t', 'Focus', 'timer', {})}
        panels={panels}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('Short break (minutes)'), { target: { value: '61' } });
    expect(screen.getAllByText(/whole number of minutes from 1 to 60/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves the zones of a clocks block', () => {
    const onSave = vi.fn();
    render(
      <BlockSettingsDialog
        block={panel('c', 'Team time', 'clocks', { zones: ['Asia/Tokyo'], place: null })}
        panels={panels}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: 'Europe/Paris' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith('c', 'clocks', {
      size: 'normal',
      zones: ['Asia/Tokyo', 'Europe/Paris'],
      place: null,
    });
  });

  it('replaces a table with pasted cells and tells how many fit', () => {
    const onSave = vi.fn();
    render(
      <BlockSettingsDialog
        block={panel('t', 'Budget', 'table', { header: true, rows: [['old']] })}
        panels={panels}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('switch', { name: /First row is a heading/ }));
    fireEvent.change(screen.getByLabelText(/Replace the table with pasted cells/), {
      target: { value: 'Name;Cost\nRent;800\n' },
    });
    expect(screen.getByText(/2 rows, 2 columns/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith('t', 'table', {
      size: 'wide',
      header: false,
      rows: [
        ['Name', 'Cost'],
        ['Rent', '800'],
      ],
    });
  });

  it('keeps the table as it is when nothing is pasted', () => {
    const onSave = vi.fn();
    render(
      <BlockSettingsDialog
        block={panel('t', 'Budget', 'table', { header: true, rows: [['keep', 'me']] })}
        panels={panels}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith('t', 'table', {
      size: 'wide',
      header: true,
      rows: [['keep', 'me']],
    });
  });

  it('saves the language, file name, line numbers and code of a snippet', () => {
    const onSave = vi.fn();
    render(
      <BlockSettingsDialog
        block={panel('s', 'Query', 'snippet', {})}
        panels={panels}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'sql' } });
    fireEvent.change(screen.getByLabelText(/File name/), { target: { value: ' cards.sql ' } });
    fireEvent.click(screen.getByRole('switch', { name: /Line numbers/ }));
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'SELECT 1;' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith('s', 'snippet', {
      size: 'wide',
      language: 'sql',
      filename: ' cards.sql ',
      code: 'SELECT 1;',
      line_numbers: true,
    });
  });

  it('will not save a snippet that is too long', () => {
    const onSave = vi.fn();
    render(
      <BlockSettingsDialog
        block={panel('s', 'Query', 'snippet', { code: 'x'.repeat(12_001) })}
        panels={panels}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    expect(screen.getAllByText(/At most 12,000 characters/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).not.toHaveBeenCalled();
  });

  it('sets what a chart counts and how it draws it', () => {
    const onSave = vi.fn();
    render(
      <BlockSettingsDialog
        block={panel('c', 'Chart', 'chart', {})}
        panels={panels}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('What to count'), { target: { value: 'assignee' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Donut' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith('c', 'chart', {
      size: 'normal',
      source: 'assignee',
      style: 'donut',
    });
  });

  it('sets the shape, the done list and the name of a progress block', () => {
    const onSave = vi.fn();
    render(
      <BlockSettingsDialog
        block={panel('p', 'Progress', 'progress', { done_list_id: 'todo' })}
        panels={panels}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Bar' }));
    fireEvent.change(screen.getByLabelText('The list that means done'), {
      target: { value: 'done' },
    });
    fireEvent.change(screen.getByLabelText(/Name \(optional\)/), {
      target: { value: 'Sprint 12' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith('p', 'progress', {
      size: 'normal',
      style: 'bar',
      label: 'Sprint 12',
      done_list_id: 'done',
    });
  });

  it('will not save a progress block until a list is chosen', () => {
    const onSave = vi.fn();
    render(
      <BlockSettingsDialog
        block={panel('p', 'Progress', 'progress', {})}
        panels={panels}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).not.toHaveBeenCalled();
  });

  it('changes the width of any block', () => {
    const onSave = vi.fn();
    render(
      <BlockSettingsDialog block={panels[2]} panels={panels} onSave={onSave} onClose={vi.fn()} />
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Wide' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith('cal', 'calendar', { size: 'wide' });
  });

  it('sets what the agenda looks at and whether it is only mine', () => {
    const onSave = vi.fn();
    render(
      <BlockSettingsDialog
        block={panel('ag', 'Soon', 'agenda', { size: 'normal', range: 'week', mine_only: false })}
        panels={panels}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Today' }));
    fireEvent.click(screen.getByRole('switch', { name: /Only my cards/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith('ag', 'agenda', {
      size: 'normal',
      range: 'today',
      mine_only: true,
    });
  });

  it('will not save a share done counter until a list is chosen', () => {
    const onSave = vi.fn();
    render(
      <BlockSettingsDialog
        block={panel('c', 'Progress', 'counter', {
          size: 'normal',
          metric: 'overdue',
          label: '',
          done_list_id: null,
          date: null,
        })}
        panels={panels}
        onSave={onSave}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('What to count'), { target: { value: 'done_percent' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Choose the list that means done.');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    const list = screen.getByLabelText('The list that means done');
    expect(
      within(list)
        .getAllByRole('option')
        .map((o) => o.textContent)
    ).toEqual(['Choose a list…', 'To do', 'Done']);
    fireEvent.change(list, { target: { value: 'done' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith(
      'c',
      'counter',
      expect.objectContaining({ metric: 'done_percent', done_list_id: 'done' })
    );
  });

  it('asks for the date to count down to', () => {
    render(
      <BlockSettingsDialog
        block={panel('c', 'Launch', 'counter', {
          size: 'normal',
          metric: 'days_left',
          label: '',
          done_list_id: null,
          date: null,
        })}
        panels={panels}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Choose the date to count down to.');
    fireEvent.change(screen.getByLabelText('Count down to'), { target: { value: '2026-12-01' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('only offers lists, never blocks, as the done list', () => {
    render(
      <BlockSettingsDialog
        block={panel('c', 'Progress', 'counter', { metric: 'done_percent' })}
        panels={panels}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const options = within(screen.getByLabelText('The list that means done'))
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options).not.toContain('Plan');
  });
});
