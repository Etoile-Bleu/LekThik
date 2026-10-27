import { describe, expect, it } from 'vitest';

import {
  SNIPPET_LANGUAGES,
  SNIPPET_MAX_CHARS,
  SNIPPET_MAX_LINES,
  checkSnippet,
  languageLabel,
  lineCount,
} from './snippet';

describe('lineCount', () => {
  it('counts lines the way the server does, ignoring one final break', () => {
    expect(lineCount('')).toBe(0);
    expect(lineCount('one')).toBe(1);
    expect(lineCount('one\ntwo\n')).toBe(2);
    expect(lineCount('one\r\ntwo\rthree')).toBe(3);
    expect(lineCount('a\n'.repeat(SNIPPET_MAX_LINES))).toBe(SNIPPET_MAX_LINES);
  });
});

describe('checkSnippet', () => {
  it('accepts code up to the limits and names the one that is passed', () => {
    expect(checkSnippet('')).toBeNull();
    expect(checkSnippet('a\n'.repeat(SNIPPET_MAX_LINES))).toBeNull();
    expect(checkSnippet('x'.repeat(SNIPPET_MAX_CHARS))).toBeNull();
    expect(checkSnippet('x'.repeat(SNIPPET_MAX_CHARS + 1))).toMatch(/characters/);
    expect(checkSnippet('a\n'.repeat(SNIPPET_MAX_LINES + 1))).toMatch(/lines/);
  });
});

describe('languages', () => {
  it('start with plain text and name each one for people', () => {
    expect(SNIPPET_LANGUAGES[0].value).toBe('text');
    expect(languageLabel('cpp')).toBe('C++');
    expect(languageLabel('xml')).toBe('HTML and XML');
    expect(new Set(SNIPPET_LANGUAGES.map((entry) => entry.value)).size).toBe(
      SNIPPET_LANGUAGES.length
    );
  });
});
