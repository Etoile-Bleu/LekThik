import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAnnouncer } from '@lib/announcer';
import { type Command, useCommandStore } from '@lib/commandStore';
import { useToastStore } from '@lib/toastStore';

import { CommandPalette } from './CommandPalette';

function setSources(commands: Command[]) {
  useCommandStore.setState({ sources: new Map([[1, () => commands]]), open: false });
}

function openPalette() {
  act(() => useCommandStore.getState().openPalette());
  return screen.getByRole('combobox', { name: 'Search commands' });
}

function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

describe('CommandPalette', () => {
  const run = vi.fn();
  const finish = vi.fn();

  beforeEach(() => {
    window.localStorage.clear();
    run.mockReset();
    finish.mockReset();
    useToastStore.setState({ toasts: [] });
    useAnnouncer.setState({ message: '', tick: 0 });
    Element.prototype.scrollIntoView = vi.fn();
    setSources([
      { id: 'fit', title: 'Fit the layout', group: 'This board', keywords: ['arrange'], run },
      {
        id: 'card',
        title: 'Add a card…',
        group: 'Create',
        suggested: true,
        steps: [
          {
            kind: 'choose',
            prompt: 'In which list?',
            choices: () => [
              { id: 'l1', title: 'Backlog', hint: '6 cards' },
              { id: 'l2', title: 'Done', hint: '9 cards' },
            ],
          },
          { kind: 'text', prompt: 'Title of the card' },
        ],
        finish,
      },
      {
        id: 'due',
        title: 'Set a due date…',
        group: 'Cards',
        steps: [
          {
            kind: 'text',
            prompt: 'Due date',
            optional: true,
            examples: ['today'],
            validate: (text) => (text === 'soon' ? 'Try today.' : null),
          },
        ],
        finish,
      },
      {
        id: 'open',
        title: 'Broadcast with sound direction',
        group: 'Cards',
        hint: 'Backlog',
        searchOnly: true,
        run,
      },
    ]);
  });

  afterEach(() => {
    act(() => useCommandStore.setState({ open: false, sources: new Map() }));
  });

  it('opens on request with the field focused and the suggestions listed', () => {
    render(<CommandPalette />);

    const input = openPalette();

    expect(document.querySelector('dialog.palette')).toHaveAttribute('open');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(screen.getByRole('listbox', { name: 'Results' })).toBeInTheDocument();
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Add a card…');
    expect(screen.queryByText('Broadcast with sound direction')).toBeNull();
  });

  it('keeps focus in the field while the arrow keys move through the results', () => {
    render(<CommandPalette />);
    const input = openPalette();
    input.focus();

    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0].id);

    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[1].id);
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });

    // It wraps from the first to the last.
    const options = screen.getAllByRole('option');
    expect(options[options.length - 1]).toHaveAttribute('aria-selected', 'true');
  });

  it('finds commands with a fuzzy search, by title or keyword, and highlights what matched', () => {
    render(<CommandPalette />);
    const input = openPalette();

    type(input, 'arrange');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option')).toHaveTextContent('Fit the layout');

    type(input, 'bcast');
    expect(screen.getByRole('option')).toHaveTextContent('Broadcast with sound direction');
    expect(document.querySelectorAll('.palette__hit').length).toBeGreaterThan(0);
  });

  it('says so when nothing matches', () => {
    render(<CommandPalette />);

    type(openPalette(), 'zzzz');

    expect(screen.getByText('Nothing matches “zzzz”.')).toBeInTheDocument();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('announces how many results there are once typing pauses', async () => {
    render(<CommandPalette />);

    type(openPalette(), 'arrange');

    await waitFor(() => expect(useAnnouncer.getState().message).toBe('1 result.'), {
      timeout: 2000,
    });
  });

  it('runs a command with enter, closes, and remembers it', () => {
    render(<CommandPalette />);
    const input = openPalette();

    type(input, 'fit');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(run).toHaveBeenCalledTimes(1);
    expect(useCommandStore.getState().open).toBe(false);
    expect(window.localStorage.getItem('lekthik.commands.recent.v1')).toContain('fit');
  });

  it('runs the command under the pointer when it is clicked', () => {
    render(<CommandPalette />);
    openPalette();

    fireEvent.click(screen.getByRole('option', { name: /Fit the layout/ }));

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('lists recently used commands first', () => {
    window.localStorage.setItem('lekthik.commands.recent.v1', JSON.stringify(['fit']));
    render(<CommandPalette />);

    openPalette();

    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Fit the layout');
    expect(screen.getByText('Recent')).toBeInTheDocument();
  });

  it('asks one question at a time, shows the trail, and finishes with the answers', async () => {
    finish.mockResolvedValue('Added “Hello” to Backlog.');
    render(<CommandPalette />);
    const input = openPalette();

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByRole('listbox', { name: 'In which list?' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Command so far' })).toHaveTextContent('Add a card…');

    type(screen.getByRole('combobox', { name: 'In which list?' }), 'back');
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'In which list?' }), { key: 'Enter' });

    const field = screen.getByRole('textbox', { name: 'Title of the card' });
    expect(screen.getByRole('list', { name: 'Command so far' })).toHaveTextContent('Backlog');
    type(field, 'Hello');
    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() => expect(finish).toHaveBeenCalledWith(['l1', 'Hello']));
    expect(useCommandStore.getState().open).toBe(false);
    expect(useToastStore.getState().toasts.map((toast) => toast.message)).toContain(
      'Added “Hello” to Backlog.'
    );
  });

  it('refuses an empty answer unless an empty one is allowed', () => {
    render(<CommandPalette />);
    const input = openPalette();
    type(input, 'add a card');
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'In which list?' }), { key: 'Enter' });

    const field = screen.getByRole('textbox', { name: 'Title of the card' });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(screen.getByRole('alert')).toHaveTextContent('Type something first.');
    expect(finish).not.toHaveBeenCalled();
  });

  it('checks an answer before accepting it, and accepts an empty one when that is allowed', async () => {
    render(<CommandPalette />);
    const input = openPalette();
    type(input, 'due');
    fireEvent.keyDown(input, { key: 'Enter' });

    const field = screen.getByRole('textbox', { name: 'Due date' });
    expect(screen.getByText('For example today.')).toBeInTheDocument();
    type(field, 'soon');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent('Try today.');
    expect(finish).not.toHaveBeenCalled();

    type(field, '');
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(finish).toHaveBeenCalledWith(['']));
  });

  it('goes back one step with backspace on an empty field and with escape, then closes', () => {
    render(<CommandPalette />);
    const input = openPalette();
    fireEvent.keyDown(input, { key: 'Enter' });
    type(screen.getByRole('combobox', { name: 'In which list?' }), 'back');
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'In which list?' }), { key: 'Enter' });
    const field = screen.getByRole('textbox', { name: 'Title of the card' });

    fireEvent.keyDown(field, { key: 'Backspace' });
    expect(screen.getByRole('combobox', { name: 'In which list?' })).toBeInTheDocument();

    const dialog = document.querySelector('dialog.palette') as HTMLDialogElement;
    const cancel = new Event('cancel', { cancelable: true });
    act(() => {
      dialog.dispatchEvent(cancel);
    });
    expect(cancel.defaultPrevented).toBe(true);
    expect(screen.getByRole('combobox', { name: 'Search commands' })).toBeInTheDocument();
    expect(useCommandStore.getState().open).toBe(true);
  });

  it('does not run a command while no result is selected', () => {
    render(<CommandPalette />);
    const input = openPalette();
    type(input, 'zzzz');

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(run).not.toHaveBeenCalled();
    expect(useCommandStore.getState().open).toBe(true);
  });
});
