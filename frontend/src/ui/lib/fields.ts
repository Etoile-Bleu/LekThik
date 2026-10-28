import type { CardFieldValue, Field, FieldKind, FieldOption, FieldValue } from './boardsApi';

export const FIELD_NAME_MAX = 60;
export const OPTION_NAME_MAX = 40;
export const FIELD_TEXT_MAX = 1000;
export const MAX_FIELDS = 30;
export const MAX_OPTIONS = 50;

export const FIELD_KINDS: Array<{ kind: FieldKind; label: string; hint: string }> = [
  { kind: 'text', label: 'Text', hint: 'A few words, up to 1000 characters.' },
  { kind: 'number', label: 'Number', hint: 'A size, a cost, a count. Totals and sorting work.' },
  { kind: 'date', label: 'Date', hint: 'A day, such as a release date.' },
  { kind: 'select', label: 'Choice', hint: 'One option from a list you define, with a colour.' },
  { kind: 'checkbox', label: 'Checkbox', hint: 'Yes or no.' },
  { kind: 'url', label: 'Link', hint: 'The address of a page.' },
];

export function kindLabel(kind: FieldKind): string {
  return FIELD_KINDS.find((entry) => entry.kind === kind)?.label ?? kind;
}

export type ValueIndex = Map<string, Map<string, FieldValue>>;

export function indexValues(values: CardFieldValue[] | undefined): ValueIndex {
  const index: ValueIndex = new Map();
  for (const entry of values ?? []) {
    const forCard = index.get(entry.card_id) ?? new Map<string, FieldValue>();
    forCard.set(entry.field_id, entry.value);
    index.set(entry.card_id, forCard);
  }
  return index;
}

export function optionOf(field: Field, value: FieldValue | undefined): FieldOption | null {
  return typeof value === 'string'
    ? (field.options.find((option) => option.id === value) ?? null)
    : null;
}

export function dayLabel(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) return day;
  return new Date(year, month - 1, date).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function numberLabel(value: string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(parsed);
}

export function hostOf(address: string): string {
  try {
    return new URL(address).host.replace(/^www\./, '');
  } catch {
    return address;
  }
}

export function displayValue(field: Field, value: FieldValue | undefined): string {
  if (value === undefined) return '';
  switch (field.kind) {
    case 'checkbox':
      return value === true ? 'Yes' : 'No';
    case 'select':
      return optionOf(field, value)?.name ?? '';
    case 'date':
      return typeof value === 'string' ? dayLabel(value) : '';
    case 'number':
      return typeof value === 'string' ? numberLabel(value) : '';
    case 'url':
      return typeof value === 'string' ? hostOf(value) : '';
    default:
      return typeof value === 'string' ? value : '';
  }
}

export function toDecimal(input: string): string | null {
  const text = input.trim().replace(/\s/g, '').replace(',', '.');
  if (text === '') return null;
  return /^-?\d{1,12}(\.\d{1,6})?$/.test(text) ? text : null;
}

export function checkNumber(input: string): string | null {
  if (input.trim() === '') return null;
  return toDecimal(input) === null
    ? 'Use a number such as 12 or -3.5, with at most 12 digits before the point and 6 after.'
    : null;
}

export function compareValues(
  field: Field,
  a: FieldValue | undefined,
  b: FieldValue | undefined
): number {
  switch (field.kind) {
    case 'number':
      return Number(a) - Number(b);
    case 'checkbox':
      return Number(a === true) - Number(b === true);
    case 'select': {
      const position = (value: FieldValue | undefined) =>
        field.options.findIndex((option) => option.id === value);
      return position(a) - position(b);
    }
    case 'date':
      return String(a).localeCompare(String(b));
    default:
      return displayValue(field, a).localeCompare(displayValue(field, b), undefined, {
        sensitivity: 'base',
        numeric: true,
      });
  }
}

/** Empty values come last whichever way the column is sorted. */
export function sortByField<T>(
  rows: T[],
  field: Field,
  direction: 'asc' | 'desc',
  valueOf: (row: T) => FieldValue | undefined
): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = valueOf(a);
    const right = valueOf(b);
    if (left === undefined && right === undefined) return 0;
    if (left === undefined) return 1;
    if (right === undefined) return -1;
    return sign * compareValues(field, left, right);
  });
}

export function shownOnCard(fields: Field[] | undefined): Field[] {
  return (fields ?? []).filter((field) => field.show_on_card).slice(0, 3);
}

export function patchValues(
  values: CardFieldValue[] | undefined,
  cardId: string,
  fieldId: string,
  value: FieldValue | null
): CardFieldValue[] {
  const rest = (values ?? []).filter(
    (entry) => !(entry.card_id === cardId && entry.field_id === fieldId)
  );
  return value === null ? rest : [...rest, { card_id: cardId, field_id: fieldId, value }];
}
