import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./boardsApi', () => ({
  fetchPresence: vi.fn(),
  sendPresence: vi.fn(),
}));

import { useAnnouncer } from './announcer';
import { fetchPresence, sendPresence } from './boardsApi';
import { DEFAULT_PREFERENCES } from './prefs';
import {
  HEARTBEAT_MS,
  nameList,
  refreshPresenceSoon,
  setPresenceCard,
  startPresence,
  stopPresence,
  usePresenceStore,
} from './presenceStore';
import { usePrefsStore } from './prefsStore';

const wen = { user_id: 'u-wen', username: 'Wen', card_id: null };
const rita = { user_id: 'u-rita', username: 'Rita', card_id: 'c1' };
const me = { user_id: 'u-me', username: 'amir', card_id: null };

describe('nameList', () => {
  it('says names the way people do', () => {
    expect(nameList([])).toBe('');
    expect(nameList(['Wen'])).toBe('Wen');
    expect(nameList(['Wen', 'Rita'])).toBe('Wen and Rita');
    expect(nameList(['Wen', 'Rita', 'Sam'])).toBe('Wen, Rita and 1 other');
    expect(nameList(['Wen', 'Rita', 'Sam', 'Lee'])).toBe('Wen, Rita and 2 others');
  });
});

describe('presence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(sendPresence).mockReset().mockResolvedValue(undefined);
    vi.mocked(fetchPresence).mockReset().mockResolvedValue({ viewers: [] });
    usePresenceStore.getState().reset();
    usePrefsStore.setState({ prefs: { ...DEFAULT_PREFERENCES } });
    useAnnouncer.setState({ message: '', tick: 0 });
  });

  afterEach(() => {
    stopPresence();
    vi.useRealTimers();
  });

  it('keeps the others by card and leaves the person themselves out', async () => {
    vi.mocked(fetchPresence).mockResolvedValue({ viewers: [me, wen, rita] });

    startPresence('b1', 'u-me');
    await vi.advanceTimersByTimeAsync(0);

    expect(usePresenceStore.getState().viewers.map((viewer) => viewer.username)).toEqual([
      'Wen',
      'Rita',
    ]);
    expect(usePresenceStore.getState().byCard.c1.map((viewer) => viewer.username)).toEqual([
      'Rita',
    ]);
  });

  it('says where it is now, then every twenty seconds', async () => {
    startPresence('b1', 'u-me');
    await vi.advanceTimersByTimeAsync(0);
    expect(sendPresence).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendPresence).mock.calls[0][1]).toMatchObject({
      card_id: null,
      present: true,
    });

    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 2);

    expect(sendPresence).toHaveBeenCalledTimes(3);
  });

  it('tells the card that is open, and none when it closes', async () => {
    startPresence('b1', 'u-me');
    await vi.advanceTimersByTimeAsync(0);

    setPresenceCard('c9');
    setPresenceCard('c9');
    setPresenceCard(null);

    const cards = vi.mocked(sendPresence).mock.calls.map((call) => call[1].card_id);
    expect(cards).toEqual([null, 'c9', null]);
  });

  it('leaves the board when it stops, and forgets the crowd', async () => {
    vi.mocked(fetchPresence).mockResolvedValue({ viewers: [wen] });
    startPresence('b1', 'u-me');
    await vi.advanceTimersByTimeAsync(0);

    stopPresence();

    expect(vi.mocked(sendPresence).mock.calls.at(-1)?.[1]).toMatchObject({ present: false });
    expect(usePresenceStore.getState().viewers).toEqual([]);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 2);
    expect(sendPresence).toHaveBeenCalledTimes(2);
  });

  it('says nothing and sends nothing for someone who chose to hide', async () => {
    usePrefsStore.setState({ prefs: { ...DEFAULT_PREFERENCES, hide_presence: true } });

    startPresence('b1', 'u-me');
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 2);
    stopPresence();

    expect(sendPresence).not.toHaveBeenCalled();
  });

  it('steps out when the choice to hide is made, and back in when it is withdrawn', async () => {
    startPresence('b1', 'u-me');
    await vi.advanceTimersByTimeAsync(0);
    vi.mocked(sendPresence).mockClear();

    usePrefsStore.setState({ prefs: { ...DEFAULT_PREFERENCES, hide_presence: true } });
    expect(vi.mocked(sendPresence).mock.calls[0][1]).toMatchObject({ present: false });

    usePrefsStore.setState({ prefs: { ...DEFAULT_PREFERENCES, hide_presence: false } });
    expect(vi.mocked(sendPresence).mock.calls[1][1]).toMatchObject({ present: true });
  });

  it('reads the crowd again soon after an event, once for a burst', async () => {
    startPresence('b1', 'u-me');
    await vi.advanceTimersByTimeAsync(0);
    vi.mocked(fetchPresence).mockClear();

    refreshPresenceSoon('b1');
    refreshPresenceSoon('b1');
    refreshPresenceSoon('other-board');
    await vi.advanceTimersByTimeAsync(300);

    expect(fetchPresence).toHaveBeenCalledTimes(1);
  });

  it('does not rebuild anything when the crowd is the same', async () => {
    vi.mocked(fetchPresence).mockResolvedValue({ viewers: [wen] });
    startPresence('b1', 'u-me');
    await vi.advanceTimersByTimeAsync(0);
    const before = usePresenceStore.getState().viewers;

    refreshPresenceSoon('b1');
    await vi.advanceTimersByTimeAsync(300);

    expect(usePresenceStore.getState().viewers).toBe(before);
  });

  it('is never a reason for the work to fail', async () => {
    vi.mocked(sendPresence).mockRejectedValue(new Error('offline'));
    vi.mocked(fetchPresence).mockRejectedValue(new Error('offline'));

    expect(() => startPresence('b1', 'u-me')).not.toThrow();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);

    expect(usePresenceStore.getState().viewers).toEqual([]);
  });

  it('announces arrivals only to people who asked for announcements, and not the first reading', async () => {
    usePrefsStore.setState({ prefs: { ...DEFAULT_PREFERENCES, announce_changes: true } });
    vi.mocked(fetchPresence).mockResolvedValueOnce({ viewers: [wen] });
    startPresence('b1', 'u-me');
    await vi.advanceTimersByTimeAsync(2000);
    expect(useAnnouncer.getState().message).toBe('');

    vi.mocked(fetchPresence).mockResolvedValueOnce({ viewers: [wen, rita] });
    refreshPresenceSoon('b1');
    await vi.advanceTimersByTimeAsync(2000);

    expect(useAnnouncer.getState().message).toBe('Rita is on this board.');
  });

  it('stays quiet about arrivals by default', async () => {
    vi.mocked(fetchPresence).mockResolvedValueOnce({ viewers: [] });
    startPresence('b1', 'u-me');
    await vi.advanceTimersByTimeAsync(0);

    vi.mocked(fetchPresence).mockResolvedValueOnce({ viewers: [wen] });
    refreshPresenceSoon('b1');
    await vi.advanceTimersByTimeAsync(2000);

    expect(useAnnouncer.getState().message).toBe('');
  });
});
