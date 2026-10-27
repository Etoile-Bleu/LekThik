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
      'Code',
    ]) {
      expect(screen.getByRole('button', { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
    expect(screen.getByText(/A month with a dot on every day/)).toBeInTheDocument();
  });

  it('picks a kind and closes', () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(<AddBlockDialog open onPick={onPick} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /^Agenda/ }));

    expect(onPick).toHaveBeenCalledWith('agenda');
    expect(onClose).toHaveBeenCalled();
  });
});

describe('BlockSettingsDialog', () => {
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
