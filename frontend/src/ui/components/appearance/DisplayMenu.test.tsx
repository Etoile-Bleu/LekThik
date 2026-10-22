import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@lib/prefsApi', () => ({
  fetchPreferences: vi.fn(),
  savePreferences: vi.fn().mockResolvedValue({}),
}));

import { DEFAULT_LOOK } from '@lib/boardLooks';
import { DEFAULT_PREFERENCES, cardDisplayFor } from '@lib/prefs';
import { usePrefsStore } from '@lib/prefsStore';

import { DisplayMenu } from './DisplayMenu';

function setup(
  canStyle = true,
  onLookChange = vi.fn(),
  view: 'board' | 'list' | 'calendar' = 'board'
) {
  render(
    <MemoryRouter initialEntries={['/b/b1']}>
      <Routes>
        <Route
          path="/b/:id"
          element={
            <DisplayMenu
              boardId="b1"
              look={DEFAULT_LOOK}
              view={view}
              listIds={['l1', 'l2']}
              canStyle={canStyle}
              onLookChange={onLookChange}
            />
          }
        />
        <Route path="/settings/appearance" element={<p>settings page</p>} />
      </Routes>
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole('button', { name: /Display/ }));
  return { panel: screen.getByRole('dialog', { name: 'Display options' }), onLookChange };
}

describe('DisplayMenu', () => {
  beforeEach(() => {
    usePrefsStore.setState({ prefs: DEFAULT_PREFERENCES, loaded: true, saveState: 'idle' });
    window.localStorage.clear();
  });

  it('changes the density', () => {
    const { panel } = setup();

    fireEvent.click(within(panel).getByRole('radio', { name: 'Compact' }));

    expect(usePrefsStore.getState().prefs.density).toBe('compact');
  });

  it('changes what cards show for all boards by default', () => {
    const { panel } = setup();

    fireEvent.click(within(panel).getByRole('switch', { name: /Labels/ }));

    const { prefs } = usePrefsStore.getState();
    expect(prefs.card_display.labels).toBe(false);
    expect(prefs.boards).toEqual({});
  });

  it('gives this board its own choices only when asked', () => {
    const { panel } = setup();

    fireEvent.click(within(panel).getByRole('switch', { name: /Only for this board/ }));
    fireEvent.click(within(panel).getByRole('switch', { name: /Due date/ }));

    const { prefs } = usePrefsStore.getState();
    expect(cardDisplayFor(prefs, 'b1').due_date).toBe(false);
    expect(prefs.card_display.due_date).toBe(true);

    fireEvent.click(within(panel).getByRole('switch', { name: /Only for this board/ }));
    expect(usePrefsStore.getState().prefs.boards).toEqual({});
  });

  it('lets writers pick the board look', () => {
    const { panel, onLookChange } = setup(true);

    fireEvent.click(within(panel).getByRole('radio', { name: 'Sage' }));
    fireEvent.click(within(panel).getByRole('radio', { name: 'Violet' }));

    expect(onLookChange).toHaveBeenNthCalledWith(1, { background: 'sage', accent: 'teal' });
    expect(onLookChange).toHaveBeenNthCalledWith(2, { background: 'default', accent: 'violet' });
  });

  it('tells readers who sets the look instead of offering it', () => {
    const { panel } = setup(false);

    expect(within(panel).queryByRole('radio', { name: 'Sage' })).not.toBeInTheDocument();
    expect(within(panel).getByText(/choose how this board looks/)).toBeInTheDocument();
  });

  it('leads to the full settings page', () => {
    const { panel } = setup();

    fireEvent.click(within(panel).getByRole('button', { name: /All settings/ }));

    expect(screen.getByText('settings page')).toBeInTheDocument();
  });

  it('sets how wide the columns are, for this board only', () => {
    const { panel } = setup();

    fireEvent.click(within(panel).getByRole('radio', { name: 'Wide' }));

    const { prefs } = usePrefsStore.getState();
    expect(prefs.boards.b1.column_width).toBe('wide');
  });

  it('folds and opens every list at once', () => {
    const { panel } = setup();
    const expandAll = within(panel).getByRole('button', { name: 'Expand all' });
    expect(expandAll).toBeDisabled();

    fireEvent.click(within(panel).getByRole('button', { name: 'Collapse all' }));
    expect(usePrefsStore.getState().prefs.boards.b1.collapsed_lists).toEqual(['l1', 'l2']);
    expect(within(panel).getByRole('button', { name: 'Collapse all' })).toBeDisabled();

    fireEvent.click(within(panel).getByRole('button', { name: 'Expand all' }));
    expect(usePrefsStore.getState().prefs.boards).toEqual({});
  });

  it('only talks about columns while the board is shown as columns', () => {
    const { panel } = setup(true, vi.fn(), 'list');

    expect(within(panel).queryByRole('radio', { name: 'Wide' })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: 'Collapse all' })).not.toBeInTheDocument();
  });
});
