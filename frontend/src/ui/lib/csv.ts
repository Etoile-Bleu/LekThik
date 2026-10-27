export const TABLE_MAX_ROWS = 100;
export const TABLE_MAX_COLUMNS = 12;
export const TABLE_CELL_MAX_CHARS = 200;
export const CSV_MAX_BYTES = 1_000_000;

type Delimiter = ',' | ';' | '\t';

const FORMULA_START = /^[=+\-@\t\r]/;
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

function isControl(char: string): boolean {
  const code = char.charCodeAt(0);
  return code < 32 || code === 127;
}

export function detectDelimiter(text: string): Delimiter {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim() !== '') ?? '';
  if (firstLine.includes('\t')) return '\t';
  const semicolons = firstLine.split(';').length;
  const commas = firstLine.split(',').length;
  return semicolons > commas ? ';' : ',';
}

export function parseDelimited(input: string, delimiter?: Delimiter): string[][] {
  const text = input.startsWith(BYTE_ORDER_MARK) ? input.slice(1) : input;
  const separator = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === separator) {
      endField();
    } else if (char === '\r') {
      if (text[index + 1] === '\n') index += 1;
      endRow();
    } else if (char === '\n') {
      endRow();
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) endRow();

  const last = rows[rows.length - 1];
  if (last && last.length === 1 && last[0] === '') rows.pop();
  return rows;
}

export function cleanCell(value: string): string {
  return Array.from(value, (char) => (isControl(char) ? ' ' : char)).join('');
}

export interface FittedTable {
  rows: string[][];
  trimmed: boolean;
}

export function fitToLimits(rows: string[][]): FittedTable {
  let trimmed = false;
  const kept = rows.slice(0, TABLE_MAX_ROWS);
  if (kept.length < rows.length) trimmed = true;
  const width = Math.min(
    TABLE_MAX_COLUMNS,
    kept.reduce((most, row) => Math.max(most, row.length), 0)
  );
  const fitted = kept.map((row) => {
    if (row.length > TABLE_MAX_COLUMNS) trimmed = true;
    return Array.from({ length: width }, (_, column) => {
      const cell = cleanCell(row[column] ?? '');
      if (cell.length > TABLE_CELL_MAX_CHARS) trimmed = true;
      return cell.slice(0, TABLE_CELL_MAX_CHARS);
    });
  });
  return { rows: fitted, trimmed };
}

function csvField(cell: string): string {
  const safe = FORMULA_START.test(cell) ? `'${cell}` : cell;
  return /[",\r\n]/.test(safe) || safe !== safe.trim() || safe !== cell
    ? `"${safe.replace(/"/g, '""')}"`
    : safe;
}

export function toCsv(rows: string[][]): string {
  return `${BYTE_ORDER_MARK}${rows.map((row) => row.map(csvField).join(',')).join('\r\n')}\r\n`;
}

export function parseNumber(text: string): number | null {
  const clean = text.trim().replace(/\s/g, '');
  if (!/^-?\d+([.,]\d+)?$/.test(clean)) return null;
  return Number(clean.replace(',', '.'));
}

export function columnTotal(rows: string[][], column: number, header: boolean): number | null {
  const body = header ? rows.slice(1) : rows;
  let total = 0;
  let numbers = 0;
  for (const row of body) {
    const cell = row[column] ?? '';
    if (cell.trim() === '') continue;
    const value = parseNumber(cell);
    if (value === null) return null;
    total += value;
    numbers += 1;
  }
  return numbers === 0 ? null : total;
}

export function formatTotal(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}
