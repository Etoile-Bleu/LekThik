import { describe, expect, it } from 'vitest';

import {
  TABLE_CELL_MAX_CHARS,
  TABLE_MAX_COLUMNS,
  TABLE_MAX_ROWS,
  columnTotal,
  detectDelimiter,
  fitToLimits,
  parseDelimited,
  parseNumber,
  toCsv,
} from './csv';

const BOM = String.fromCharCode(0xfeff);

describe('parseDelimited', () => {
  it('reads plain comma separated rows', () => {
    expect(parseDelimited('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles quotes, doubled quotes, commas and line breaks inside a field', () => {
    const text = '"Name","Quote"\r\n"Maya, M.","She said ""hi"""\r\n"Two\nlines",x\r\n';

    expect(parseDelimited(text)).toEqual([
      ['Name', 'Quote'],
      ['Maya, M.', 'She said "hi"'],
      ['Two\nlines', 'x'],
    ]);
  });

  it('strips a byte order mark and ends on any kind of line break', () => {
    expect(parseDelimited(`${BOM}a,b\rc,d\r\ne,f\n`)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
    ]);
  });

  it('keeps empty cells and a quote that is not at the start of a field', () => {
    expect(parseDelimited('a,,c\n5" pipe,x,')).toEqual([
      ['a', '', 'c'],
      ['5" pipe', 'x', ''],
    ]);
  });

  it('reads French exports with semicolons and pasted spreadsheet cells with tabs', () => {
    expect(detectDelimiter('Nom;Prix\nPain;1,20')).toBe(';');
    expect(parseDelimited('Nom;Prix\nPain;1,20')).toEqual([
      ['Nom', 'Prix'],
      ['Pain', '1,20'],
    ]);
    expect(detectDelimiter('a\tb\tc')).toBe('\t');
    expect(parseDelimited('a\tb\n1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('returns nothing for nothing, and survives an unclosed quote', () => {
    expect(parseDelimited('')).toEqual([]);
    expect(parseDelimited('\n')).toEqual([]);
    expect(parseDelimited('a,"open\nstill')).toEqual([['a', 'open\nstill']]);
  });
});

describe('fitToLimits', () => {
  it('pads ragged rows, replaces control characters and reports nothing lost when it fits', () => {
    const fitted = fitToLimits([['a', 'b\tc'], ['d']]);

    expect(fitted).toEqual({
      rows: [
        ['a', 'b c'],
        ['d', ''],
      ],
      trimmed: false,
    });
  });

  it('cuts rows, columns and long cells to the limits and says so', () => {
    const tall = Array.from({ length: TABLE_MAX_ROWS + 5 }, () => ['x']);
    const wide = [Array.from({ length: TABLE_MAX_COLUMNS + 3 }, () => 'x')];
    const long = [['y'.repeat(TABLE_CELL_MAX_CHARS + 20)]];

    expect(fitToLimits(tall)).toMatchObject({ trimmed: true });
    expect(fitToLimits(tall).rows).toHaveLength(TABLE_MAX_ROWS);
    expect(fitToLimits(wide).rows[0]).toHaveLength(TABLE_MAX_COLUMNS);
    expect(fitToLimits(wide).trimmed).toBe(true);
    expect(fitToLimits(long).rows[0][0]).toHaveLength(TABLE_CELL_MAX_CHARS);
    expect(fitToLimits(long).trimmed).toBe(true);
  });
});

describe('toCsv', () => {
  it('writes a byte order mark, quotes what needs it and ends rows with CRLF', () => {
    const csv = toCsv([
      ['Name', 'Note'],
      ['Maya, M.', 'said "hi"'],
      ['a', 'two\nlines'],
    ]);

    expect(csv).toBe(`${BOM}Name,Note\r\n"Maya, M.","said ""hi"""\r\na,"two\nlines"\r\n`);
  });

  it('keeps a spreadsheet from running a cell that starts like a formula', () => {
    const csv = toCsv([['=HYPERLINK("http://evil.example")', '+1', '-2', '@SUM(A1)', 'fine']]);

    expect(csv).toBe(
      `${BOM}"'=HYPERLINK(""http://evil.example"")","'+1","'-2","'@SUM(A1)",fine\r\n`
    );
  });

  it('round trips what it writes, apart from the guard on formulas', () => {
    const rows = [
      ['a', 'b, c', 'd "e"'],
      ['', ' padded ', 'plain'],
    ];

    expect(parseDelimited(toCsv(rows))).toEqual(rows);
  });
});

describe('numbers', () => {
  it('reads whole numbers, decimals with a point or a comma, and negatives', () => {
    expect(parseNumber('12')).toBe(12);
    expect(parseNumber(' -3.5 ')).toBe(-3.5);
    expect(parseNumber('1,25')).toBe(1.25);
    expect(parseNumber('1 000')).toBe(1000);
  });

  it('refuses anything else, including things a formula would accept', () => {
    for (const text of ['', 'abc', '1e3', '12px', '1.2.3', '=1+1', '0x10', 'Infinity']) {
      expect(parseNumber(text)).toBeNull();
    }
  });

  it('totals a column only when every filled cell is a number', () => {
    const rows = [
      ['Item', 'Cost'],
      ['Rent', '800'],
      ['Food', '120,5'],
      ['Gift', ''],
      ['Misc', '9.5'],
    ];

    expect(columnTotal(rows, 1, true)).toBe(930);
    expect(columnTotal(rows, 0, true)).toBeNull();
    expect(columnTotal([['x', 'y']], 1, true)).toBeNull();
    expect(columnTotal([['1'], ['2']], 0, false)).toBe(3);
    expect(columnTotal([['Cost'], ['n/a']], 0, true)).toBeNull();
  });
});
