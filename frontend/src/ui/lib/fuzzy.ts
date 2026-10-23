export interface FuzzyMatch {
  /** Higher is better. */
  score: number;
  /** Where the characters of the query were found in the text, for highlighting. */
  indexes: number[];
}

const SEPARATORS = new Set([' ', '-', '_', '/', '.', ':', '(', ')', '[', ']', ',']);

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function boundary(text: string, index: number): boolean {
  return index === 0 || SEPARATORS.has(text[index - 1]);
}

/**
 * Finds the letters of a query in order inside a text, the way command menus do: "adc" finds
 * "Add card". Accents and case are ignored. A match scores higher when it starts the text, starts
 * words, and runs unbroken, and lower the more it spreads out. Returns `null` when the letters
 * are not all there.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const needle = fold(query).replace(/\s+/g, ' ').trim();
  if (needle === '') return { score: 0, indexes: [] };
  const hay = fold(text);

  // A plain substring is the best kind of match, so it is tried first.
  const at = hay.indexOf(needle);
  if (at !== -1) {
    let score = 100 - Math.min(at, 40) + (boundary(hay, at) ? 40 : 0);
    if (at === 0) score += 30;
    if (hay.length === needle.length) score += 40;
    return { score, indexes: Array.from({ length: needle.length }, (_, k) => at + k) };
  }

  const indexes: number[] = [];
  let cursor = 0;
  let score = 0;
  let streak = 0;
  for (const char of needle) {
    if (char === ' ') {
      streak = 0;
      continue;
    }
    const found = hay.indexOf(char, cursor);
    if (found === -1) return null;
    const joined = indexes.length > 0 && found === indexes[indexes.length - 1] + 1;
    streak = joined ? streak + 1 : 0;
    score += 4 + streak * 3 + (boundary(hay, found) ? 8 : 0) - Math.min(found - cursor, 6);
    indexes.push(found);
    cursor = found + 1;
  }
  return { score: Math.max(1, score - Math.floor(hay.length / 8)), indexes };
}

/** Splits a text into runs, marking the characters a match found, so they can be drawn bold. */
export function highlightRuns(
  text: string,
  indexes: number[]
): Array<{ text: string; hit: boolean }> {
  if (indexes.length === 0) return [{ text, hit: false }];
  const hits = new Set(indexes);
  const runs: Array<{ text: string; hit: boolean }> = [];
  for (let position = 0; position < text.length; position++) {
    const hit = hits.has(position);
    const last = runs[runs.length - 1];
    if (last && last.hit === hit) last.text += text[position];
    else runs.push({ text: text[position], hit });
  }
  return runs;
}
