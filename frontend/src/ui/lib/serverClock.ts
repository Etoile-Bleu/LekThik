const HALF_SECOND = 500;
const MAX_PLAUSIBLE_OFFSET = 12 * 3_600_000;

let offset = 0;

export function observeServerDate(header: string | null, receivedAt: number = Date.now()): void {
  if (!header) return;
  const sent = Date.parse(header);
  if (!Number.isFinite(sent)) return;
  const measured = sent + HALF_SECOND - receivedAt;
  if (Math.abs(measured) > MAX_PLAUSIBLE_OFFSET) return;
  offset = measured;
}

export function serverNow(): number {
  return Date.now() + offset;
}

export function serverOffset(): number {
  return offset;
}

export function resetServerClock(): void {
  offset = 0;
}
