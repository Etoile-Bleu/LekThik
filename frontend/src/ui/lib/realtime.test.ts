import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./boardsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./boardsApi')>();
  return { ...actual, fetchMyCards: vi.fn().mockResolvedValue([]) };
});
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>();
  return { ...actual, whenWritesSettle: () => Promise.resolve() };
});

import * as boardsApi from './boardsApi';
import { useMyCardsStore } from './myCardsStore';
import { useLiveStore, startRealtime } from './realtime';

type Listener = (event: MessageEvent<string>) => void;

class FakeEventSource {
  static instance: FakeEventSource | null = null;
  static CLOSED = 2;
  readyState = 1;
  onerror: (() => void) | null = null;
  listeners = new Map<string, Listener[]>();

  constructor() {
    FakeEventSource.instance = this;
  }

  addEventListener(name: string, listener: Listener) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }

  emit(name: string, payload: object = {}) {
    for (const listener of this.listeners.get(name) ?? []) {
      listener({ data: JSON.stringify(payload) } as MessageEvent<string>);
    }
  }
}

const payload = { workspace_id: 'w1', board_id: 'b9', user_id: null, origin: 'someone-else' };

describe('realtime and my cards', () => {
  let stop: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.stubGlobal('EventSource', FakeEventSource);
    useMyCardsStore.setState({ cards: [], status: 'ready', watchers: 0 });
    stop = startRealtime();
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('says it is live once the stream is ready', () => {
    FakeEventSource.instance?.emit('ready');

    expect(useLiveStore.getState().status).toBe('live');
  });

  it('refetches my cards when a board changes while the page is open', async () => {
    const unwatch = useMyCardsStore.getState().watch();

    FakeEventSource.instance?.emit('board', payload);
    await vi.advanceTimersByTimeAsync(300);

    expect(boardsApi.fetchMyCards).toHaveBeenCalledTimes(1);
    unwatch();
  });

  it('does not spend a request on my cards when nobody is looking at them', async () => {
    FakeEventSource.instance?.emit('board', payload);
    FakeEventSource.instance?.emit('workspace', payload);
    await vi.advanceTimersByTimeAsync(300);

    expect(boardsApi.fetchMyCards).not.toHaveBeenCalled();
  });

  it('turns a burst of changes into one request', async () => {
    const unwatch = useMyCardsStore.getState().watch();

    for (let index = 0; index < 5; index += 1) {
      FakeEventSource.instance?.emit('board', payload);
    }
    await vi.advanceTimersByTimeAsync(300);

    expect(boardsApi.fetchMyCards).toHaveBeenCalledTimes(1);
    unwatch();
  });

  it('follows workspace and membership changes too', async () => {
    const unwatch = useMyCardsStore.getState().watch();

    FakeEventSource.instance?.emit('members', payload);
    await vi.advanceTimersByTimeAsync(300);
    FakeEventSource.instance?.emit('workspace', payload);
    await vi.advanceTimersByTimeAsync(300);

    expect(boardsApi.fetchMyCards).toHaveBeenCalledTimes(2);
    unwatch();
  });

  it('catches up after a reconnection or a gap', async () => {
    const unwatch = useMyCardsStore.getState().watch();

    FakeEventSource.instance?.emit('resync');
    await vi.advanceTimersByTimeAsync(10);

    expect(boardsApi.fetchMyCards).toHaveBeenCalled();
    unwatch();
  });

  it('keeps what is on screen when a refresh fails', async () => {
    vi.mocked(boardsApi.fetchMyCards).mockRejectedValueOnce(new Error('offline'));
    useMyCardsStore.setState({
      cards: [
        {
          id: 'c1',
          title: 'Kept',
          due_date: null,
          list_id: 'l',
          list_name: 'L',
          board_id: 'b',
          board_name: 'B',
          workspace_id: 'w',
          workspace_name: 'W',
        },
      ],
    });
    const unwatch = useMyCardsStore.getState().watch();

    FakeEventSource.instance?.emit('board', payload);
    await vi.advanceTimersByTimeAsync(300);

    expect(useMyCardsStore.getState().cards).toHaveLength(1);
    expect(useMyCardsStore.getState().status).toBe('ready');
    unwatch();
  });

  it('catches up when the network comes back', async () => {
    const unwatch = useMyCardsStore.getState().watch();

    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(10);

    expect(boardsApi.fetchMyCards).toHaveBeenCalled();
    unwatch();
  });

  it('tries a failed refresh once more, so a hiccup does not leave the page stale', async () => {
    vi.mocked(boardsApi.fetchMyCards).mockRejectedValueOnce(new Error('offline'));
    const unwatch = useMyCardsStore.getState().watch();

    FakeEventSource.instance?.emit('board', payload);
    await vi.advanceTimersByTimeAsync(300);
    expect(boardsApi.fetchMyCards).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5100);
    expect(boardsApi.fetchMyCards).toHaveBeenCalledTimes(2);
    unwatch();
  });
});
