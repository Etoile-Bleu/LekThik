import { describe, expect, it } from 'vitest';

import type { CardFieldValue, Field } from './boardsApi';
import {
  checkNumber,
  compareValues,
  dayLabel,
  displayValue,
  hostOf,
  indexValues,
  kindLabel,
  numberLabel,
  optionOf,
  patchValues,
  shownOnCard,
  sortByField,
  toDecimal,
} from './fields';

function field(extra: Partial<Field> & Pick<Field, 'kind'>): Field {
  return {
    id: 'f',
    board_id: 'b',
    name: 'Field',
    position: 0,
    show_on_card: false,
    options: [],
    ...extra,
  };
}

const env = field({
  id: 'env',
  kind: 'select',
  options: [
    { id: 'o1', name: 'Staging', color: 'amber' },
    { id: 'o2', name: 'Production', color: 'red' },
  ],
});

describe('values', () => {
  const values: CardFieldValue[] = [
    { card_id: 'c1', field_id: 'size', value: '8' },
    { card_id: 'c1', field_id: 'env', value: 'o1' },
    { card_id: 'c2', field_id: 'size', value: '3' },
  ];

  it('are indexed by card and then by field', () => {
    const index = indexValues(values);

    expect(index.get('c1')?.get('size')).toBe('8');
    expect(index.get('c1')?.get('env')).toBe('o1');
    expect(index.get('c2')?.get('env')).toBeUndefined();
    expect(index.get('c3')).toBeUndefined();
    expect(indexValues(undefined).size).toBe(0);
  });

  it('are set, replaced and cleared without touching the rest', () => {
    const replaced = patchValues(values, 'c1', 'size', '13');
    const cleared = patchValues(values, 'c1', 'size', null);
    const added = patchValues(undefined, 'c9', 'size', true);

    expect(replaced.filter((entry) => entry.card_id === 'c1' && entry.field_id === 'size')).toEqual(
      [{ card_id: 'c1', field_id: 'size', value: '13' }]
    );
    expect(replaced).toHaveLength(3);
    expect(cleared).toHaveLength(2);
    expect(added).toEqual([{ card_id: 'c9', field_id: 'size', value: true }]);
    expect(values).toHaveLength(3);
  });
});

describe('what a value says', () => {
  it('is written for people, whatever the kind', () => {
    expect(displayValue(field({ kind: 'text' }), 'ACME')).toBe('ACME');
    expect(displayValue(field({ kind: 'checkbox' }), true)).toBe('Yes');
    expect(displayValue(field({ kind: 'checkbox' }), false)).toBe('No');
    expect(displayValue(env, 'o2')).toBe('Production');
    expect(displayValue(env, 'gone')).toBe('');
    expect(displayValue(field({ kind: 'url' }), 'https://www.example.com/spec')).toBe(
      'example.com'
    );
    expect(displayValue(field({ kind: 'number' }), '1234.5')).toBe(numberLabel('1234.5'));
    expect(displayValue(field({ kind: 'date' }), '2026-11-02')).toBe(dayLabel('2026-11-02'));
    expect(displayValue(field({ kind: 'text' }), undefined)).toBe('');
  });

  it('finds the option a choice stands for', () => {
    expect(optionOf(env, 'o1')?.name).toBe('Staging');
    expect(optionOf(env, true)).toBeNull();
    expect(optionOf(env, undefined)).toBeNull();
    expect(hostOf('not a url')).toBe('not a url');
    expect(kindLabel('select')).toBe('Choice');
  });
});

describe('numbers typed by a person', () => {
  it('accept a point or a comma and keep digits exact', () => {
    expect(toDecimal('12')).toBe('12');
    expect(toDecimal(' 1,5 ')).toBe('1.5');
    expect(toDecimal('-3.25')).toBe('-3.25');
    expect(toDecimal('1 000')).toBe('1000');
    expect(toDecimal('')).toBeNull();
  });

  it('refuse everything else and say why', () => {
    for (const bad of ['1e3', 'abc', '1.2.3', '+1', '1.', '.5', '0.0000001', '1234567890123']) {
      expect(toDecimal(bad), bad).toBeNull();
      expect(checkNumber(bad), bad).toMatch(/Use a number/);
    }
    expect(checkNumber('')).toBeNull();
    expect(checkNumber('42')).toBeNull();
  });
});

describe('sorting', () => {
  const rows = [
    { id: 'a', value: '10' as string | boolean | undefined },
    { id: 'b', value: undefined },
    { id: 'c', value: '9' },
    { id: 'd', value: '100' },
  ];
  const size = field({ kind: 'number' });

  it('compares numbers as numbers and not as text', () => {
    const asc = sortByField(rows, size, 'asc', (row) => row.value).map((row) => row.id);
    const desc = sortByField(rows, size, 'desc', (row) => row.value).map((row) => row.id);

    expect(asc).toEqual(['c', 'a', 'd', 'b']);
    expect(desc).toEqual(['d', 'a', 'c', 'b']);
  });

  it('keeps empty values last in both directions, and the original untouched', () => {
    const copy = [...rows];

    sortByField(rows, size, 'desc', (row) => row.value);

    expect(rows).toEqual(copy);
    expect(sortByField(rows, size, 'asc', (row) => row.value).at(-1)?.id).toBe('b');
    expect(sortByField(rows, size, 'desc', (row) => row.value).at(-1)?.id).toBe('b');
  });

  it('orders choices as the board lists them, dates as days and checkboxes unchecked first', () => {
    expect(compareValues(env, 'o2', 'o1')).toBeGreaterThan(0);
    expect(compareValues(field({ kind: 'date' }), '2026-01-02', '2026-11-02')).toBeLessThan(0);
    expect(compareValues(field({ kind: 'checkbox' }), true, false)).toBeGreaterThan(0);
    expect(compareValues(field({ kind: 'text' }), 'Élan', 'zebra')).toBeLessThan(0);
    expect(compareValues(field({ kind: 'text' }), 'item 2', 'item 10')).toBeLessThan(0);
  });
});

describe('the face of a card', () => {
  it('shows at most three of the fields flagged for it, in order', () => {
    const fields = [1, 2, 3, 4, 5].map((n) =>
      field({ id: `f${n}`, kind: 'text', show_on_card: n !== 2 })
    );

    expect(shownOnCard(fields).map((entry) => entry.id)).toEqual(['f1', 'f3', 'f4']);
    expect(shownOnCard(undefined)).toEqual([]);
  });
});
