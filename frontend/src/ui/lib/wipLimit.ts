/** How a list stands against its work in progress limit. */
export type LimitState = 'none' | 'under' | 'at' | 'over';

export function limitState(count: number, limit: number | null): LimitState {
  if (limit === null) return 'none';
  if (count > limit) return 'over';
  if (count === limit) return 'at';
  return 'under';
}

function cards(count: number): string {
  return `${count} card${count === 1 ? '' : 's'}`;
}

/** The sentence for a screen reader, since the badge on screen is only digits. */
export function describeCount(count: number, limit: number | null): string {
  const state = limitState(count, limit);
  if (limit === null) return cards(count);
  if (state === 'over') {
    return `${cards(count)}, limit ${limit}, ${count - limit} over the limit`;
  }
  if (state === 'at') return `${cards(count)}, at the limit of ${limit}`;
  return `${cards(count)}, limit ${limit}`;
}

/** Turns what was typed into a limit: a whole number from 1 to 99, or `null` when it is empty. */
export function parseLimit(text: string): { ok: true; value: number | null } | { ok: false } {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  if (!/^\d{1,3}$/.test(trimmed)) return { ok: false };
  const value = Number(trimmed);
  return value >= 1 && value <= 99 ? { ok: true, value } : { ok: false };
}
