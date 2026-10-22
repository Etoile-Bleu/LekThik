import { describe, expect, it } from 'vitest';

import {
  SNIPPETS,
  countTasks,
  hostOf,
  insertBlock,
  isExternal,
  needsMath,
  needsMermaid,
  prefixLines,
  safeHref,
  toggleTask,
  wrap,
} from './richText';

describe('what a text needs to load', () => {
  it('finds inline and display maths', () => {
    expect(needsMath('The area is $\\pi r^2$ here')).toBe(true);
    expect(needsMath('$x$')).toBe(true);
    expect(needsMath('before\n\n$$\nE = mc^2\n$$\n\nafter')).toBe(true);
  });

  it('does not mistake prices and dollars for maths', () => {
    expect(needsMath('It costs $5 and then $10 more')).toBe(false);
    expect(needsMath('Just a $ sign')).toBe(false);
    expect(needsMath('price: \\$5 and \\$6')).toBe(false);
    expect(needsMath('no dollars at all')).toBe(false);
  });

  it('finds a diagram', () => {
    expect(needsMermaid('Intro\n\n```mermaid\nflowchart LR\n  A --> B\n```')).toBe(true);
    expect(needsMermaid('```js\nconst a = 1\n```')).toBe(false);
    expect(needsMermaid('the word mermaid alone')).toBe(false);
  });
});

describe('safe links', () => {
  it('allows web addresses, mail and places in the same text', () => {
    expect(safeHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(safeHref('http://example.com')).toBe('http://example.com/');
    expect(safeHref('mailto:team@example.com')).toBe('mailto:team@example.com');
    expect(safeHref('#section')).toBe('#section');
  });

  it('refuses everything that can run code or leave the web', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      '  javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'ftp://example.com',
      '//example.com',
      'example.com',
      '',
      undefined,
    ]) {
      expect(safeHref(bad)).toBeNull();
    }
  });

  it('tells outside links from the rest, and names the site', () => {
    expect(isExternal('https://example.com')).toBe(true);
    expect(isExternal('mailto:a@b.c')).toBe(false);
    expect(isExternal('#top')).toBe(false);
    expect(hostOf('https://www.example.com/path')).toBe('example.com');
  });
});

describe('checklists', () => {
  const text = '- [ ] one\n- [x] two\n\n```\n- [ ] not a task\n```\n\n1. [ ] three';

  it('counts the boxes, leaving out code', () => {
    expect(countTasks(text)).toBe(3);
    expect(countTasks('nothing here')).toBe(0);
  });

  it('ticks and unticks one box at a time', () => {
    expect(toggleTask(text, 0)).toContain('- [x] one');
    expect(toggleTask(text, 1)).toContain('- [ ] two');
    expect(toggleTask(text, 2)).toContain('1. [x] three');
  });

  it('never touches the rest of the text, or the code', () => {
    const changed = toggleTask(text, 0);

    expect(changed.replace('- [x] one', '- [ ] one')).toBe(text);
    expect(changed).toContain('- [ ] not a task');
  });

  it('leaves the text alone when there is no such box', () => {
    expect(toggleTask(text, 9)).toBe(text);
    expect(toggleTask(text, -1)).toBe(text);
  });

  it('accepts a capital X and nested boxes', () => {
    expect(toggleTask('- [X] done', 0)).toBe('- [ ] done');
    expect(toggleTask('- a\n  - [ ] nested', 0)).toBe('- a\n  - [x] nested');
  });
});

describe('the formatting buttons', () => {
  it('wraps the selection, or a placeholder when nothing is selected', () => {
    const selected = wrap('make this bold', 5, 9, '**', '**', 'bold');
    expect(selected.text).toBe('make **this** bold');
    expect(selected.text.slice(selected.start, selected.end)).toBe('this');

    const empty = wrap('', 0, 0, '*', '*', 'italic');
    expect(empty.text).toBe('*italic*');
    expect(empty.text.slice(empty.start, empty.end)).toBe('italic');
  });

  it('starts every selected line with a prefix, and takes it off again', () => {
    const on = prefixLines('one\ntwo\nthree', 0, 7, '- ');
    expect(on.text).toBe('- one\n- two\nthree');

    const off = prefixLines(on.text, 0, on.end, '- ');
    expect(off.text).toBe('one\ntwo\nthree');
  });

  it('only changes the line the cursor is on', () => {
    expect(prefixLines('a\nb\nc', 2, 2, '> ').text).toBe('a\n> b\nc');
  });

  it('puts a block of its own, with a blank line around it', () => {
    expect(insertBlock('before after', 7, 7, SNIPPETS.table).text).toBe(
      `before \n\n${SNIPPETS.table}\n\nafter`
    );
    expect(insertBlock('', 0, 0, SNIPPETS.code).text).toBe(SNIPPETS.code);
    expect(insertBlock('line\n', 5, 5, SNIPPETS.math).text).toBe(`line\n\n${SNIPPETS.math}`);
  });

  it('can select a part of the block it inserted', () => {
    const edit = insertBlock('', 0, 0, '```js\ncode here\n```', { from: 6, to: 15 });

    expect(edit.text.slice(edit.start, edit.end)).toBe('code here');
  });

  it('ships a diagram that already has an accessible title and description', () => {
    expect(SNIPPETS.diagram).toContain('accTitle:');
    expect(SNIPPETS.diagram).toContain('accDescr:');
    expect(needsMermaid(SNIPPETS.diagram)).toBe(true);
    expect(needsMath(SNIPPETS.math)).toBe(true);
  });
});
