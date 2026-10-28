import { describe, expect, it } from 'vitest';

import {
  hourIn,
  hourLabel,
  isKnownZone,
  msUntilNextMinute,
  readClock,
  sharedWindow,
  supportedZones,
  workSlots,
  zoneLabel,
} from './clocks';

const winter = new Date('2026-01-15T12:00:00Z');
const summer = new Date('2026-07-15T12:00:00Z');

describe('zones', () => {
  it('knows real zones and refuses made up ones', () => {
    expect(isKnownZone('Europe/Paris')).toBe(true);
    expect(isKnownZone('UTC')).toBe(true);
    expect(isKnownZone('Etc/GMT+5')).toBe(true);
    expect(isKnownZone('Mars/Olympus_Mons')).toBe(false);
    expect(isKnownZone('../etc/passwd')).toBe(false);
    expect(isKnownZone('')).toBe(false);
  });

  it('lists zones to choose from, UTC included', () => {
    const zones = supportedZones();

    expect(zones).toContain('Europe/Paris');
    expect(zones).toContain('UTC');
    expect(new Set(zones).size).toBe(zones.length);
  });

  it('names a zone by its city', () => {
    expect(zoneLabel('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
    expect(zoneLabel('Asia/Tokyo')).toBe('Tokyo');
    expect(zoneLabel('UTC')).toBe('UTC');
  });
});

describe('readClock', () => {
  it('shows the time of a zone with its offset, following summer time by itself', () => {
    expect(hourIn('Europe/Paris', winter)).toBe(13);
    expect(hourIn('Europe/Paris', summer)).toBe(14);
    expect(readClock('Europe/Paris', winter, 'UTC', 'en-GB')).toMatchObject({
      label: 'Paris',
      time: '13:00',
      offset: 'UTC+1',
    });
    expect(readClock('Europe/Paris', summer, 'UTC', 'en-GB')?.offset).toBe('UTC+2');
    expect(readClock('Asia/Kolkata', winter, 'UTC', 'en-GB')).toMatchObject({
      time: '17:30',
      offset: 'UTC+5:30',
    });
  });

  it('says when it is another day there, and whether it is day or night', () => {
    const late = new Date('2026-01-15T22:30:00Z');

    const tokyo = readClock('Asia/Tokyo', late, 'Europe/Paris', 'en-GB');
    const la = readClock('America/Los_Angeles', late, 'Europe/Paris', 'en-GB');
    const paris = readClock('Europe/Paris', late, 'Europe/Paris', 'en-GB');

    expect(tokyo).toMatchObject({ relative: 'Tomorrow', daylight: 'day', time: '07:30' });
    expect(la).toMatchObject({ relative: '', daylight: 'day', time: '14:30' });
    expect(paris).toMatchObject({ relative: '', daylight: 'night' });
    expect(readClock('Pacific/Honolulu', new Date('2026-01-15T05:00:00Z'), 'UTC')?.relative).toBe(
      'Yesterday'
    );
    expect(readClock('Asia/Tokyo', new Date('2026-01-15T11:00:00Z'), 'UTC')?.daylight).toBe(
      'night'
    );
  });

  it('is read out as one sentence', () => {
    expect(
      readClock('Asia/Tokyo', new Date('2026-01-15T22:30:00Z'), 'Europe/Paris', 'en-GB')?.spoken
    ).toBe('Tokyo: 07:30, tomorrow, UTC+9, daytime.');
  });

  it('gives nothing for a zone it does not know', () => {
    expect(readClock('Mars/Olympus_Mons', winter)).toBeNull();
  });
});

describe('the minute tick', () => {
  it('waits for the start of the next minute', () => {
    expect(msUntilNextMinute(new Date('2026-01-15T12:00:00.000Z'))).toBe(60_050);
    expect(msUntilNextMinute(new Date('2026-01-15T12:00:59.500Z'))).toBe(550);
  });
});

describe('working hours in common', () => {
  const noon = new Date('2026-01-15T12:20:00Z');

  it('counts, for every hour of the day, the zones that are at work', () => {
    const slots = workSlots(['Europe/Paris', 'Asia/Tokyo'], noon, 'UTC');

    expect(slots).toHaveLength(24);
    expect(slots[0]).toEqual({ hour: 0, open: 1 });
    expect(slots[9]).toEqual({ hour: 9, open: 1 });
    expect(slots[20]).toEqual({ hour: 20, open: 0 });
    expect(slots[23].hour).toBe(23);
  });

  it('finds the longest stretch when everyone is at work', () => {
    const slots = workSlots(['Europe/Paris', 'America/New_York'], noon, 'Europe/Paris');
    const window = sharedWindow(slots, 2);

    expect(window).toEqual({ from: 15, to: 18 });
    expect(hourLabel(window?.from ?? 0)).toBe('15:00');
  });

  it('finds nothing when the zones never overlap, and needs at least two', () => {
    const far = workSlots(['Europe/Paris', 'Asia/Tokyo', 'America/Los_Angeles'], noon, 'UTC');

    expect(sharedWindow(far, 3)).toBeNull();
    expect(sharedWindow(workSlots(['Europe/Paris'], noon, 'UTC'), 1)).toBeNull();
  });
});
