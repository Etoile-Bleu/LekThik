export const MAX_ZONES = 6;
export const WORK_FROM = 9;
export const WORK_TO = 18;

const FALLBACK_ZONES = [
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Moscow',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
  'America/Sao_Paulo',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
];

export function viewerZone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function isKnownZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function supportedZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  try {
    const found = intl.supportedValuesOf?.('timeZone');
    if (found && found.length > 0) return found.includes('UTC') ? found : ['UTC', ...found];
  } catch {
    return FALLBACK_ZONES;
  }
  return FALLBACK_ZONES;
}

export function zoneLabel(zone: string): string {
  const last = zone.split('/').at(-1) ?? zone;
  return last.replace(/_/g, ' ');
}

export function hourIn(zone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(instant);
  return Number(parts.find((part) => part.type === 'hour')?.value ?? 0) % 24;
}

export function dayKey(zone: string, instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

export type Daylight = 'day' | 'night';

export interface ClockReading {
  zone: string;
  label: string;
  time: string;
  date: string;
  offset: string;
  relative: '' | 'Yesterday' | 'Tomorrow';
  daylight: Daylight;
  spoken: string;
}

export function readClock(
  zone: string,
  instant: Date,
  viewer: string = viewerZone(),
  locale?: string
): ClockReading | null {
  if (!isKnownZone(zone)) return null;

  const time = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(instant);
  const date = new Intl.DateTimeFormat(locale, {
    timeZone: zone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(instant);
  const offsetPart = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'shortOffset' })
    .formatToParts(instant)
    .find((part) => part.type === 'timeZoneName')?.value;
  const offset = (offsetPart ?? 'GMT').replace('GMT', 'UTC');

  const there = dayKey(zone, instant);
  const here = dayKey(viewer, instant);
  const relative = there < here ? 'Yesterday' : there > here ? 'Tomorrow' : '';
  const hour = hourIn(zone, instant);
  const daylight: Daylight = hour >= 7 && hour < 20 ? 'day' : 'night';
  const label = zoneLabel(zone);
  const spoken = `${label}: ${time}${relative ? `, ${relative.toLowerCase()}` : ''}, ${offset}, ${daylight === 'day' ? 'daytime' : 'night'}.`;

  return { zone, label, time, date, offset, relative, daylight, spoken };
}

export function msUntilNextMinute(instant: Date): number {
  return 60_000 - (instant.getTime() % 60_000) + 50;
}

export interface Slot {
  hour: number;
  open: number;
}

export function workSlots(zones: string[], instant: Date, viewer: string = viewerZone()): Slot[] {
  const minutes = hourIn(viewer, instant) * 60;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: viewer,
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(instant);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  const second = Number(parts.find((part) => part.type === 'second')?.value ?? 0);
  const start = instant.getTime() - ((minutes + minute) * 60 + second) * 1000;

  return Array.from({ length: 24 }, (_, step) => {
    const at = new Date(start + step * 3_600_000);
    const open = zones.filter((zone) => {
      const hour = hourIn(zone, at);
      return hour >= WORK_FROM && hour < WORK_TO;
    }).length;
    return { hour: hourIn(viewer, at), open };
  });
}

export interface SharedWindow {
  from: number;
  to: number;
}

export function sharedWindow(slots: Slot[], total: number): SharedWindow | null {
  if (total < 2) return null;
  let best: { start: number; length: number } | null = null;
  let start = -1;
  for (let index = 0; index <= slots.length; index += 1) {
    const everyone = index < slots.length && slots[index].open === total;
    if (everyone && start === -1) start = index;
    if (!everyone && start !== -1) {
      const length = index - start;
      if (!best || length > best.length) best = { start, length };
      start = -1;
    }
  }
  if (!best) return null;
  return {
    from: slots[best.start].hour,
    to: (slots[best.start + best.length - 1].hour + 1) % 24,
  };
}

export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}
