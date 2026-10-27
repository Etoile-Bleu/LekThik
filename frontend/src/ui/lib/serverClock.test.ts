import { afterEach, describe, expect, it, vi } from 'vitest';

import { observeServerDate, resetServerClock, serverNow, serverOffset } from './serverClock';

afterEach(() => {
  resetServerClock();
  vi.useRealTimers();
});

describe('the server clock', () => {
  it('starts equal to this device', () => {
    expect(serverOffset()).toBe(0);
  });

  it('learns how far this device is from the server, rounding the second up to its middle', () => {
    const received = Date.parse('2026-10-27T12:00:00Z');

    observeServerDate('Tue, 27 Oct 2026 12:00:10 GMT', received);

    expect(serverOffset()).toBe(10_500);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(received);
    expect(serverNow()).toBe(received + 10_500);
  });

  it('follows a device that is ahead of the server', () => {
    observeServerDate('Tue, 27 Oct 2026 12:00:00 GMT', Date.parse('2026-10-27T12:05:00Z'));

    expect(serverOffset()).toBe(-299_500);
  });

  it('ignores a missing, broken or implausible date', () => {
    observeServerDate('Tue, 27 Oct 2026 12:00:10 GMT', Date.parse('2026-10-27T12:00:00Z'));
    const learned = serverOffset();

    observeServerDate(null);
    observeServerDate('not a date');
    observeServerDate('Tue, 27 Oct 2026 12:00:00 GMT', Date.parse('2026-12-01T00:00:00Z'));

    expect(serverOffset()).toBe(learned);
  });
});
