/**
 * Plain helpers for the Markdown a note or a description is written in: what it needs to load,
 * which links are safe, how the checklist boxes are switched, and what the formatting buttons do
 * to the text. None of it touches the page, so all of it is tested directly.
 */

/** Whether the text holds maths, so the maths libraries are only loaded when they are needed. */
export function needsMath(text: string): boolean {
  return /\$\$[\s\S]+?\$\$|(?<![\\$])\$[^\s$][^$\n]*?[^\s\\$]\$(?!\d)|(?<![\\$])\$[^\s$\\]\$(?!\d)/.test(
    text
  );
}

export function needsMermaid(text: string): boolean {
  return /^\s*```+\s*mermaid\b/m.test(text);
}

/** Link targets that are allowed: web addresses, mail, and places inside the same text. */
export function safeHref(url: string | undefined): string | null {
  if (!url) return null;
  const value = url.trim();
  if (value.startsWith('#')) return value;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
    if (parsed.protocol === 'mailto:') return parsed.href;
  } catch {
    return null;
  }
  return null;
}

export function isExternal(href: string): boolean {
  return /^https?:/i.test(href);
}

export function hostOf(href: string): string {
  try {
    return new URL(href).host.replace(/^www\./, '');
  } catch {
    return href;
  }
}

const TASK = /^(\s*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\](\s)/;
const FENCE = /^\s*(```+|~~~+)/;

/** The lines of the text that are not inside a code fence, with their position. */
function openLines(text: string): Array<{ line: string; index: number }> {
  const lines = text.split('\n');
  const found: Array<{ line: string; index: number }> = [];
  let fence: string | null = null;
  lines.forEach((line, index) => {
    const marker = FENCE.exec(line)?.[1];
    if (marker) {
      if (fence === null) fence = marker[0];
      else if (marker[0] === fence) fence = null;
      return;
    }
    if (fence === null) found.push({ line, index });
  });
  return found;
}

export function countTasks(text: string): number {
  return openLines(text).filter(({ line }) => TASK.test(line)).length;
}

/**
 * Ticks or unticks the nth checkbox of a checklist (counting from 0, in reading order, skipping
 * code). Returns the text unchanged when there is no such box.
 */
export function toggleTask(text: string, which: number): string {
  const lines = text.split('\n');
  const tasks = openLines(text).filter(({ line }) => TASK.test(line));
  const target = tasks[which];
  if (!target) return text;
  lines[target.index] = lines[target.index].replace(
    TASK,
    (_all, lead: string, mark: string, space: string) =>
      `${lead}[${mark === ' ' ? 'x' : ' '}]${space}`
  );
  return lines.join('\n');
}

export interface Edit {
  text: string;
  /** Where the selection should be afterwards. */
  start: number;
  end: number;
}

/** Puts `before` and `after` around the selection, or around a placeholder when nothing is selected. */
export function wrap(
  text: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder: string
): Edit {
  const selected = text.slice(start, end);
  const inner = selected || placeholder;
  const next = `${text.slice(0, start)}${before}${inner}${after}${text.slice(end)}`;
  return { text: next, start: start + before.length, end: start + before.length + inner.length };
}

/** Starts every line of the selection with `prefix`, or removes it when they all have it. */
export function prefixLines(text: string, start: number, end: number, prefix: string): Edit {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const nextBreak = text.indexOf('\n', end);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const lines = text.slice(lineStart, lineEnd).split('\n');
  const all = lines.every((line) => line.startsWith(prefix));
  const changed = lines
    .map((line) => (all ? line.slice(prefix.length) : `${prefix}${line}`))
    .join('\n');
  return {
    text: `${text.slice(0, lineStart)}${changed}${text.slice(lineEnd)}`,
    start: lineStart,
    end: lineStart + changed.length,
  };
}

/** Puts a block of its own at the selection, with a blank line before and after it. */
export function insertBlock(
  text: string,
  start: number,
  end: number,
  block: string,
  select?: { from: number; to: number }
): Edit {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const lead =
    before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const trail =
    after === '' || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const offset = before.length + lead.length;
  return {
    text: `${before}${lead}${block}${trail}${after}`,
    start: offset + (select?.from ?? block.length),
    end: offset + (select?.to ?? block.length),
  };
}

export const SNIPPETS = {
  code: '```js\ncode here\n```',
  table: '| Column | Column |\n| --- | --- |\n| Cell | Cell |',
  math: '$$\nE = mc^2\n$$',
  diagram:
    '```mermaid\naccTitle: Short title\naccDescr: What the diagram shows, in one sentence\nflowchart LR\n  A[Start] --> B[Finish]\n```',
} as const;

export const MARKDOWN_HELP: Array<{ what: string; how: string }> = [
  { what: 'Bold, italic, strikethrough', how: '**bold**  *italic*  ~~struck~~' },
  { what: 'Heading', how: '# Title  or  ## Section' },
  { what: 'Lists', how: '- item  or  1. item' },
  { what: 'Checklist', how: '- [ ] to do  or  - [x] done' },
  { what: 'Link', how: '[words](https://example.com)' },
  { what: 'Quote', how: '> quoted words' },
  { what: 'Code', how: '`inline`  or a fenced block with ```' },
  { what: 'Table', how: '| A | B |  then  | --- | --- |' },
  { what: 'Maths (LaTeX)', how: '$x^2$  or a block between $$ and $$' },
  { what: 'Diagram (Mermaid)', how: 'a fenced block that starts with ```mermaid' },
];
