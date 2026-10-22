import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./prefsApi', () => ({
  fetchPreferences: vi.fn(),
  savePreferences: vi.fn(),
}));

import { APPEARANCE_CACHE_KEY } from './appearance';
import {
  DEFAULT_CARD_DISPLAY,
  DEFAULT_PREFERENCES,
  cardDisplayFor,
  hasBoardDisplay,
} from './prefs';
import { fetchPreferences, savePreferences } from './prefsApi';
import { usePrefsStore } from './prefsStore';

describe('prefsStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(savePreferences).mockResolvedValue(DEFAULT_PREFERENCES);
    usePrefsStore.setState({ prefs: DEFAULT_PREFERENCES, loaded: false, saveState: 'idle' });
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('applies a change at once and keeps it for the next first paint', () => {
    usePrefsStore.getState().update({ theme: 'dark', density: 'compact' });

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.density).toBe('compact');
    expect(JSON.parse(window.localStorage.getItem(APPEARANCE_CACHE_KEY) ?? '{}')).toMatchObject({
      theme: 'dark',
      density: 'compact',
    });
  });

  it('saves once after a burst of changes settles, and says so', async () => {
    const { update } = usePrefsStore.getState();

    update({ density: 'compact' });
    update({ density: 'spacious' });
    update({ text_size: 'large' });
    expect(usePrefsStore.getState().saveState).toBe('saving');
    expect(savePreferences).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(700);

    expect(savePreferences).toHaveBeenCalledTimes(1);
    expect(vi.mocked(savePreferences).mock.calls[0][0]).toMatchObject({
      density: 'spacious',
      text_size: 'large',
    });
    expect(usePrefsStore.getState().saveState).toBe('saved');
  });

  it('keeps the change on this device and reports it when the server cannot be reached', async () => {
    vi.mocked(savePreferences).mockRejectedValue(new Error('offline'));

    usePrefsStore.getState().update({ theme: 'light' });
    await vi.advanceTimersByTimeAsync(700);

    expect(usePrefsStore.getState().prefs.theme).toBe('light');
    expect(usePrefsStore.getState().saveState).toBe('error');
  });

  it('gives a board its own card content, or takes it away again', () => {
    const own = { ...DEFAULT_CARD_DISPLAY, labels: false };
    const { setBoardCardDisplay } = usePrefsStore.getState();

    setBoardCardDisplay('b1', own);
    const prefs = usePrefsStore.getState().prefs;
    expect(cardDisplayFor(prefs, 'b1').labels).toBe(false);
    expect(cardDisplayFor(prefs, 'b2').labels).toBe(true);
    expect(hasBoardDisplay(prefs, 'b1')).toBe(true);

    setBoardCardDisplay('b1', null);
    expect(hasBoardDisplay(usePrefsStore.getState().prefs, 'b1')).toBe(false);
  });

  it('loads and applies the saved settings of the signed in person', async () => {
    vi.mocked(fetchPreferences).mockResolvedValue({ ...DEFAULT_PREFERENCES, theme: 'contrast' });

    await usePrefsStore.getState().load();

    expect(usePrefsStore.getState().prefs.theme).toBe('contrast');
    expect(document.documentElement.dataset.theme).toBe('contrast');
    expect(usePrefsStore.getState().loaded).toBe(true);
  });

  it('falls back to the defaults when loading fails', async () => {
    vi.mocked(fetchPreferences).mockRejectedValue(new Error('401'));

    await usePrefsStore.getState().load();

    expect(usePrefsStore.getState().prefs).toEqual(DEFAULT_PREFERENCES);
    expect(usePrefsStore.getState().loaded).toBe(true);
  });
});
