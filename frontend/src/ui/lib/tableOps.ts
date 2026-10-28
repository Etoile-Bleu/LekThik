import { TABLE_CELL_MAX_CHARS, TABLE_MAX_COLUMNS, TABLE_MAX_ROWS, cleanCell } from './csv';

export const STARTER_TABLE: string[][] = [
  ['Item', 'Value'],
  ['', ''],
  ['', ''],
];

function widthOf(rows: string[][]): number {
  return rows.reduce((most, row) => Math.max(most, row.length), 0);
}

export function setCell(rows: string[][], row: number, column: number, value: string): string[][] {
  return rows.map((current, index) =>
    index === row ? current.map((cell, at) => (at === column ? value : cell)) : current
  );
}

export function canAddRow(rows: string[][]): boolean {
  return rows.length < TABLE_MAX_ROWS;
}

export function canAddColumn(rows: string[][]): boolean {
  return widthOf(rows) < TABLE_MAX_COLUMNS;
}

export function addRow(rows: string[][], after: number): string[][] {
  if (!canAddRow(rows)) return rows;
  const blank = Array.from({ length: Math.max(1, widthOf(rows)) }, () => '');
  return [...rows.slice(0, after + 1), blank, ...rows.slice(after + 1)];
}

export function addColumn(rows: string[][], after: number): string[][] {
  if (!canAddColumn(rows)) return rows;
  if (rows.length === 0) return [['']];
  return rows.map((row) => [...row.slice(0, after + 1), '', ...row.slice(after + 1)]);
}

export function removeRow(rows: string[][], row: number): string[][] {
  return rows.filter((_, index) => index !== row);
}

export function removeColumn(rows: string[][], column: number): string[][] {
  const next = rows.map((row) => row.filter((_, index) => index !== column));
  return widthOf(next) === 0 ? [] : next;
}

export interface Pasted {
  rows: string[][];
  trimmed: boolean;
}

export function pasteGrid(
  rows: string[][],
  row: number,
  column: number,
  pasted: string[][]
): Pasted {
  let trimmed = false;
  const width = Math.max(widthOf(rows), 1);
  const next = rows.map((current) => [...current]);

  pasted.forEach((line, lineIndex) => {
    const targetRow = row + lineIndex;
    if (targetRow >= TABLE_MAX_ROWS) {
      trimmed = true;
      return;
    }
    while (next.length <= targetRow) next.push(Array.from({ length: width }, () => ''));
    line.forEach((cell, cellIndex) => {
      const targetColumn = column + cellIndex;
      if (targetColumn >= TABLE_MAX_COLUMNS) {
        trimmed = true;
        return;
      }
      for (const current of next) {
        while (current.length <= targetColumn) current.push('');
      }
      const clean = cleanCell(cell);
      if (clean.length > TABLE_CELL_MAX_CHARS) trimmed = true;
      next[targetRow][targetColumn] = clean.slice(0, TABLE_CELL_MAX_CHARS);
    });
  });

  const finalWidth = widthOf(next);
  return {
    rows: next.map((current) => current.concat(Array(finalWidth - current.length).fill(''))),
    trimmed,
  };
}
