import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@lib/prefsApi', () => ({
  fetchPreferences: vi.fn(),
  savePreferences: vi.fn().mockResolvedValue({}),
}));

import { useAnnouncer } from '@lib/announcer';
import { DEFAULT_PREFERENCES } from '@lib/prefs';
import { usePrefsStore } from '@lib/prefsStore';

import { CardDialogSection } from './CardDialogSection';

describe('CardDialogSection', () => {
  beforeEach(() => {
    usePrefsStore.setState({ prefs: DEFAULT_PREFERENCES, loaded: true, saveState: 'idle' });
    useAnnouncer.setState({ message: '', tick: 0 });
    window.localStorage.clear();
  });

  it('lists the four properties in the saved order', () => {
    render(<CardDialogSection />);

    expect(screen.getAllByRole('switch')).toHaveLength(4);
    expect(screen.getByRole('switch', { name: /Assignees/ })).toBeChecked();
  });

  it('moves a property down with a button, saves it and announces it', () => {
    render(<CardDialogSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Move Assignees down' }));

    expect(usePrefsStore.getState().prefs.card_dialog.order).toEqual([
      'due_date',
      'assignees',
      'labels',
      'list',
    ]);
    expect(useAnnouncer.getState().message).toBe('Assignees moved down, position 2 of 4.');
  });

  it('moves a property up', () => {
    render(<CardDialogSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Move List up' }));

    expect(usePrefsStore.getState().prefs.card_dialog.order).toEqual([
      'assignees',
      'due_date',
      'list',
      'labels',
    ]);
  });

  it('cannot move the first one up or the last one down', () => {
    render(<CardDialogSection />);

    expect(screen.getByRole('button', { name: 'Move Assignees up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move List down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Labels up' })).toBeEnabled();
  });

  it('hides and shows a property', () => {
    render(<CardDialogSection />);

    fireEvent.click(screen.getByRole('switch', { name: /Labels/ }));
    expect(usePrefsStore.getState().prefs.card_dialog.hidden).toEqual(['labels']);
    expect(screen.getByRole('switch', { name: /Labels/ })).not.toBeChecked();
    expect(useAnnouncer.getState().message).toBe('Labels hidden.');

    fireEvent.click(screen.getByRole('switch', { name: /Labels/ }));
    expect(usePrefsStore.getState().prefs.card_dialog.hidden).toEqual([]);
  });

  it('shows only the visible properties in the preview, in order', () => {
    usePrefsStore.setState({
      prefs: {
        ...DEFAULT_PREFERENCES,
        card_dialog: { order: ['labels', 'due_date', 'assignees', 'list'], hidden: ['due_date'] },
      },
    });
    render(<CardDialogSection />);

    const preview = screen.getByRole('region', { name: 'Preview' });
    const groups = within(preview).getAllByRole('group');
    expect(groups.map((group) => group.textContent)).toEqual([
      expect.stringContaining('Labels'),
      expect.stringContaining('Assignees'),
      expect.stringContaining('List'),
    ]);
  });

  it('says what is left when everything is hidden', () => {
    usePrefsStore.setState({
      prefs: {
        ...DEFAULT_PREFERENCES,
        card_dialog: {
          order: ['assignees', 'due_date', 'labels', 'list'],
          hidden: ['assignees', 'due_date', 'labels', 'list'],
        },
      },
    });
    render(<CardDialogSection />);

    expect(screen.getByText(/title and description always stay/)).toBeInTheDocument();
  });

  it('resets the layout, and only offers to when it has changed', () => {
    render(<CardDialogSection />);
    const reset = screen.getByRole('button', { name: 'Reset the layout' });
    expect(reset).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Move Assignees down' }));
    expect(reset).toBeEnabled();
    fireEvent.click(reset);

    expect(usePrefsStore.getState().prefs.card_dialog).toEqual({
      order: ['assignees', 'due_date', 'labels', 'list'],
      hidden: [],
    });
  });

  it('completes a layout saved before a property existed', () => {
    usePrefsStore.setState({
      prefs: { ...DEFAULT_PREFERENCES, card_dialog: { order: ['labels'], hidden: [] } },
    });
    render(<CardDialogSection />);

    expect(screen.getAllByRole('switch')).toHaveLength(4);
  });
});
