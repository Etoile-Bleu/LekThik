import { type ReactNode, useEffect, useRef } from 'react';
import { create } from 'zustand';

import { fuzzyMatch } from './fuzzy';

/** One thing to pick while a command asks for more. */
export interface CommandChoice {
  id: string;
  title: string;
  hint?: string;
  icon?: ReactNode;
}

/** A question a command asks before it runs: pick one of some choices, or type something. */
export type CommandStep =
  | {
      kind: 'choose';
      /** Shown in the field while this step is open, as a question. */
      prompt: string;
      choices: () => CommandChoice[];
    }
  | {
      kind: 'text';
      prompt: string;
      /** Whether an empty answer is acceptable, such as clearing a due date. */
      optional?: boolean;
      /** Returns a message when the text cannot be used, shown under the field. */
      validate?: (text: string) => string | null;
      /** Helps the person type, shown while the field is empty. */
      examples?: string[];
    };

export interface Command {
  /** Stable, so recent commands can be remembered between visits. */
  id: string;
  title: string;
  /** The heading it is listed under. */
  group: string;
  keywords?: string[];
  icon?: ReactNode;
  /** Keys shown on the right, such as ["G", "B"]. Only a reminder, the palette does not bind them. */
  shortcut?: string[];
  /** A short line of context after the title, such as the board a card is on. */
  hint?: string;
  /** Runs at once. */
  run?: () => void | Promise<void>;
  /** Asks first, then runs with the answers in order. */
  steps?: CommandStep[];
  finish?: (answers: string[]) => string | void | Promise<string | void>;
  /** Left out of the list when nothing is typed, so long lists do not crowd the first screen. */
  searchOnly?: boolean;
  /** Listed before the others when nothing is typed. */
  suggested?: boolean;
}

type Source = () => Command[];

interface CommandState {
  open: boolean;
  sources: Map<number, Source>;
  openPalette: () => void;
  closePalette: () => void;
  toggle: () => void;
}

let nextSource = 1;

export const useCommandStore = create<CommandState>((set) => ({
  open: false,
  sources: new Map(),
  openPalette: () => set({ open: true }),
  closePalette: () => set({ open: false }),
  toggle: () => set((state) => ({ open: !state.open })),
}));

function register(source: Source): () => void {
  const id = nextSource;
  nextSource += 1;
  useCommandStore.setState((state) => ({ sources: new Map(state.sources).set(id, source) }));
  return () =>
    useCommandStore.setState((state) => {
      const sources = new Map(state.sources);
      sources.delete(id);
      return { sources };
    });
}

/**
 * Lets a screen offer commands while it is open. `build` is read when the palette opens and as
 * it is used, so it always sees the screen's latest data without re-registering.
 */
export function useCommandSource(build: Source): void {
  const latest = useRef(build);
  latest.current = build;
  useEffect(() => register(() => latest.current()), []);
}

export function collectCommands(): Command[] {
  const seen = new Set<string>();
  const all: Command[] = [];
  for (const source of useCommandStore.getState().sources.values()) {
    for (const command of source()) {
      if (seen.has(command.id)) continue;
      seen.add(command.id);
      all.push(command);
    }
  }
  return all;
}

// ---- recent commands, kept in this browser only ----

const RECENT_KEY = 'lekthik.commands.recent.v1';
const RECENT_MAX = 6;

export function readRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string').slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

export function rememberCommand(id: string): void {
  try {
    const next = [id, ...readRecent().filter((item) => item !== id)].slice(0, RECENT_MAX);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Private windows and blocked storage just mean nothing is remembered.
  }
}

export function forgetRecent(): void {
  try {
    window.localStorage.removeItem(RECENT_KEY);
  } catch {
    // Nothing to forget.
  }
}

// ---- ranking ----

export interface Ranked {
  command: Command;
  /** Where the title matched, for highlighting. Empty when nothing was typed. */
  indexes: number[];
  score: number;
}

/** The order a command is given when two match equally: where it is listed. */
const GROUP_ORDER = [
  'This board',
  'Create',
  'View',
  'Cards',
  'Go to',
  'Boards',
  'Appearance',
  'Account',
];

function groupRank(group: string): number {
  const index = GROUP_ORDER.indexOf(group);
  return index === -1 ? GROUP_ORDER.length : index;
}

export const MAX_RESULTS = 60;

/**
 * What the palette lists. With nothing typed: recent commands first, then the suggestions of the
 * screen, then everything that is not search only. With a query: every command whose title or
 * keywords hold the letters, best first, with recently used ones breaking ties.
 */
export function rankCommands(commands: Command[], query: string, recent: string[]): Ranked[] {
  const text = query.trim();

  if (text === '') {
    const byId = new Map(commands.map((command) => [command.id, command]));
    const recents = recent
      .map((id) => byId.get(id))
      .filter((command): command is Command => command !== undefined)
      .map((command) => ({ command: { ...command, group: 'Recent' }, indexes: [], score: 0 }));
    const recentIds = new Set(recents.map((item) => item.command.id));
    const rest = commands
      .filter((command) => !command.searchOnly && !recentIds.has(command.id))
      .sort(
        (a, b) =>
          Number(b.suggested ?? false) - Number(a.suggested ?? false) ||
          groupRank(a.group) - groupRank(b.group)
      )
      .map((command) => ({ command, indexes: [], score: 0 }));
    return [...recents, ...rest].slice(0, MAX_RESULTS);
  }

  const ranked: Ranked[] = [];
  for (const command of commands) {
    const title = fuzzyMatch(text, command.title);
    let best = title ? { score: title.score + 20, indexes: title.indexes } : null;
    for (const keyword of command.keywords ?? []) {
      const found = fuzzyMatch(text, keyword);
      // A keyword is a hint, so it never outranks a match in the title itself.
      if (found && (!best || found.score - 25 > best.score)) {
        best = { score: found.score - 25, indexes: [] };
      }
    }
    if (!best) {
      const withHint = command.hint ? fuzzyMatch(text, `${command.title} ${command.hint}`) : null;
      if (withHint) best = { score: withHint.score - 10, indexes: [] };
    }
    if (best) {
      const bonus = recent.includes(command.id) ? 6 : 0;
      ranked.push({ command, indexes: best.indexes, score: best.score + bonus });
    }
  }
  return ranked
    .sort(
      (a, b) =>
        b.score - a.score ||
        groupRank(a.command.group) - groupRank(b.command.group) ||
        a.command.title.localeCompare(b.command.title)
    )
    .slice(0, MAX_RESULTS);
}

// ---- typing a date quickly ----

function iso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Reads a due date the way people say it: `today`, `tomorrow`, `friday`, `next week`, `+3d`,
 * `+2w` or `2026-03-14`. `none` or `clear` means no date. Returns `undefined` when it cannot be
 * read and `null` for no date.
 */
export function parseQuickDate(input: string, now: Date = new Date()): string | null | undefined {
  const text = input.trim().toLowerCase();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const plus = (days: number) => {
    const next = new Date(from);
    next.setDate(next.getDate() + days);
    return iso(next);
  };

  if (text === 'none' || text === 'clear' || text === 'no date') return null;
  if (text === 'today') return plus(0);
  if (text === 'tomorrow') return plus(1);
  if (text === 'next week') return plus(7);
  const weekday = WEEKDAYS.findIndex((name) => name === text || name.slice(0, 3) === text);
  if (weekday !== -1) {
    const ahead = (weekday - from.getDay() + 7) % 7 || 7;
    return plus(ahead);
  }
  const relative = /^\+(\d{1,3})([dw])$/.exec(text);
  if (relative) return plus(Number(relative[1]) * (relative[2] === 'w' ? 7 : 1));
  const absolute = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (absolute) {
    const [, year, month, day] = absolute.map(Number);
    const parsed = new Date(year, month - 1, day);
    const real =
      parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
    return real ? text : undefined;
  }
  return undefined;
}
