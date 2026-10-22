import { describe, expect, it } from 'vitest';

import { describeCount, limitState, parseLimit } from './wipLimit';

describe('work in progress limits', () => {
  it('stands against the limit', () => {
    expect(limitState(3, null)).toBe('none');
    expect(limitState(2, 3)).toBe('under');
    expect(limitState(3, 3)).toBe('at');
    expect(limitState(4, 3)).toBe('over');
    expect(limitState(0, 1)).toBe('under');
  });

  it('describes the count in words, with the limit when there is one', () => {
    expect(describeCount(1, null)).toBe('1 card');
    expect(describeCount(0, null)).toBe('0 cards');
    expect(describeCount(2, 5)).toBe('2 cards, limit 5');
    expect(describeCount(5, 5)).toBe('5 cards, at the limit of 5');
    expect(describeCount(7, 5)).toBe('7 cards, limit 5, 2 over the limit');
  });

  it('reads a typed limit', () => {
    expect(parseLimit('4')).toEqual({ ok: true, value: 4 });
    expect(parseLimit(' 12 ')).toEqual({ ok: true, value: 12 });
    expect(parseLimit('99')).toEqual({ ok: true, value: 99 });
    expect(parseLimit('')).toEqual({ ok: true, value: null });
    expect(parseLimit('   ')).toEqual({ ok: true, value: null });
  });

  it('refuses what is not a limit', () => {
    for (const text of ['0', '100', '-1', '2.5', 'five', '1e2', '007x', '1000']) {
      expect(parseLimit(text)).toEqual({ ok: false });
    }
  });
});
