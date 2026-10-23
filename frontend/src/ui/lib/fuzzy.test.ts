import { describe, expect, it } from 'vitest';

import { fuzzyMatch, highlightRuns } from './fuzzy';

describe('fuzzyMatch', () => {
  it('finds letters in order and nothing else', () => {
    expect(fuzzyMatch('adc', 'Add a card')).not.toBeNull();
    expect(fuzzyMatch('xyz', 'Add a card')).toBeNull();
    expect(fuzzyMatch('dac', 'Add a card')).not.toBeNull();
    expect(fuzzyMatch('cda', 'Add a card')).toBeNull();
  });

  it('ignores case and accents', () => {
    expect(fuzzyMatch('ECRAN', 'Écran')).not.toBeNull();
    expect(fuzzyMatch('cafe', 'Café du matin')).not.toBeNull();
  });

  it('treats an empty query as matching everything', () => {
    expect(fuzzyMatch('  ', 'anything')).toEqual({ score: 0, indexes: [] });
  });

  it('ranks a prefix above a scattered match', () => {
    const prefix = fuzzyMatch('add', 'Add a card');
    const scattered = fuzzyMatch('add', 'Assign a card to me, daily');

    expect(prefix?.score ?? 0).toBeGreaterThan(scattered?.score ?? 0);
  });

  it('ranks a match at the start of a word above one in the middle', () => {
    const start = fuzzyMatch('card', 'Add a card');
    const middle = fuzzyMatch('ard', 'Add a card');

    expect(start?.score ?? 0).toBeGreaterThan(middle?.score ?? 0);
  });

  it('prefers a whole word to the same letters spread out', () => {
    const whole = fuzzyMatch('fit', 'Fit the layout');
    const spread = fuzzyMatch('fit', 'Find a thing to do');

    expect(whole?.score ?? 0).toBeGreaterThan(spread?.score ?? 0);
  });

  it('reports where each letter was found', () => {
    expect(fuzzyMatch('ac', 'Add a card')?.indexes).toEqual([0, 6]);
  });
});

describe('highlightRuns', () => {
  it('joins neighbouring letters into one run', () => {
    expect(highlightRuns('Add a card', [0, 1, 2])).toEqual([
      { text: 'Add', hit: true },
      { text: ' a card', hit: false },
    ]);
  });

  it('draws nothing special when there is no match', () => {
    expect(highlightRuns('Add', [])).toEqual([{ text: 'Add', hit: false }]);
  });
});
