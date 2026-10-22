import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@lib/prefsApi', () => ({
  fetchPreferences: vi.fn(),
  savePreferences: vi.fn().mockResolvedValue({}),
}));

import { DEFAULT_PREFERENCES } from '@lib/prefs';
import { usePrefsStore } from '@lib/prefsStore';

import { SettingsPage } from './SettingsPage';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/settings/:section" element={<SettingsPage />} />
        <Route path="/settings" element={<p>settings root</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('SettingsPage', () => {
  beforeEach(() => {
    usePrefsStore.setState({ prefs: DEFAULT_PREFERENCES, loaded: true, saveState: 'idle' });
    window.localStorage.clear();
  });

  it('lists the sections and marks the one you are on', () => {
    renderAt('/settings/reading');

    const nav = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(within(nav).getAllByRole('link')).toHaveLength(6);
    expect(within(nav).getByRole('link', { name: /Reading/ })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Reading' })).toBeInTheDocument();
  });

  it('sends an unknown section back to the first one', () => {
    renderAt('/settings/nope');

    expect(screen.getByRole('heading', { level: 2, name: 'Appearance' })).toBeInTheDocument();
  });

  it('changes the theme and the density at once', () => {
    renderAt('/settings/appearance');

    fireEvent.click(screen.getByRole('radio', { name: /Dark/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Compact' }));

    expect(usePrefsStore.getState().prefs.theme).toBe('dark');
    expect(usePrefsStore.getState().prefs.density).toBe('compact');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('turns what a card shows on and off', () => {
    renderAt('/settings/appearance');

    fireEvent.click(screen.getByRole('switch', { name: /Description preview/ }));

    expect(usePrefsStore.getState().prefs.card_display.description_preview).toBe(true);
  });

  it('sets text size, font and spacing', () => {
    renderAt('/settings/reading');

    fireEvent.click(screen.getByRole('radio', { name: '150%' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Lexend' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Wider' }));

    expect(usePrefsStore.getState().prefs).toMatchObject({
      text_size: 'largest',
      reading_font: 'lexend',
      letter_spacing: 'wider',
    });
  });

  it('locks the shapes switch on while a colour vision mode is chosen', () => {
    renderAt('/settings/colour');
    const shapes = screen.getByRole('switch', { name: /Mark colours with shapes/ });
    expect(shapes).not.toBeDisabled();
    expect(shapes).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(screen.getByRole('radio', { name: 'Red-green' }));

    expect(usePrefsStore.getState().prefs.color_vision).toBe('redgreen');
    expect(shapes).toBeDisabled();
    expect(shapes).toHaveAttribute('aria-checked', 'true');
  });

  it('switches the control and motion settings', () => {
    renderAt('/settings/controls');

    for (const name of [
      /Larger buttons/,
      /Stronger focus/,
      /Plain board backgrounds/,
      /Reduce motion/,
      /Announce changes/,
    ]) {
      fireEvent.click(screen.getByRole('switch', { name }));
    }

    expect(usePrefsStore.getState().prefs).toMatchObject({
      large_targets: true,
      strong_focus: true,
      flat_backgrounds: true,
      motion: 'reduce',
      announce_changes: true,
    });
    expect(document.documentElement.dataset.targets).toBe('large');
  });

  it('resets appearance and accessibility but keeps what boards show', () => {
    usePrefsStore.setState({
      prefs: {
        ...DEFAULT_PREFERENCES,
        theme: 'dark',
        large_targets: true,
        card_display: { ...DEFAULT_PREFERENCES.card_display, labels: false },
      },
    });
    renderAt('/settings/controls');

    fireEvent.click(screen.getByRole('button', { name: /Reset appearance and accessibility/ }));

    const { prefs } = usePrefsStore.getState();
    expect(prefs.theme).toBe('system');
    expect(prefs.large_targets).toBe(false);
  });

  it('shows help, without a preview, and links to the announcements setting', () => {
    renderAt('/settings/help');

    expect(screen.getByRole('heading', { level: 3, name: 'Use the keyboard' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Live preview')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Announce changes from teammates/ })).toHaveAttribute(
      'href',
      '/settings/controls'
    );
  });

  it('shows a live preview that follows what a card shows', () => {
    renderAt('/settings/appearance');
    const preview = screen.getByLabelText('Live preview');
    expect(within(preview).getByText('Write the launch post')).toBeInTheDocument();
    expect(within(preview).getByText('Amir, Wen', { exact: false })).toBeInTheDocument();

    act(() => {
      usePrefsStore.setState({
        prefs: {
          ...DEFAULT_PREFERENCES,
          card_display: { ...DEFAULT_PREFERENCES.card_display, assignees: false },
        },
      });
    });

    expect(within(preview).queryByText('Amir, Wen', { exact: false })).not.toBeInTheDocument();
  });

  it('says when the changes were saved, and when they could not be', () => {
    usePrefsStore.setState({ saveState: 'saved' });
    const { rerender } = renderAt('/settings/appearance');
    expect(screen.getByRole('status')).toHaveTextContent('Saved to your account');

    usePrefsStore.setState({ saveState: 'error' });
    rerender(
      <MemoryRouter initialEntries={['/settings/appearance']}>
        <Routes>
          <Route path="/settings/:section" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getAllByRole('status')[0]).toHaveTextContent(/Could not save/);
  });
});
