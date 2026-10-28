import type { PollConfig, PollTally } from './boardsApi';

export const POLL_QUESTION_MAX = 200;
export const POLL_OPTION_MAX = 80;
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 10;

export const DEFAULT_POLL: PollConfig = {
  size: 'normal',
  question: 'What should we do?',
  options: [
    { id: 'a', text: 'Option 1' },
    { id: 'b', text: 'Option 2' },
  ],
  show_voters: false,
  closed: false,
};

export function votesFor(tally: PollTally | undefined, optionId: string): number {
  return tally?.counts.find((entry) => entry.option_id === optionId)?.votes ?? 0;
}

export function sharePercent(votes: number, total: number): number {
  return total === 0 ? 0 : Math.round((votes / total) * 100);
}

export function leaders(config: PollConfig, tally: PollTally | undefined): string[] {
  if (!tally || tally.total === 0) return [];
  const best = Math.max(...config.options.map((option) => votesFor(tally, option.id)));
  return config.options
    .filter((option) => votesFor(tally, option.id) === best)
    .map((option) => option.id);
}

export function newOptionId(taken: string[]): string {
  for (let index = 0; index < 1000; index += 1) {
    const id = `o${index.toString(36)}`;
    if (!taken.includes(id)) return id;
  }
  return `o${Date.now().toString(36)}`.slice(0, 12);
}

export function applyVote(
  tally: PollTally | undefined,
  listId: string,
  optionId: string | null
): PollTally {
  const base: PollTally = tally ?? {
    list_id: listId,
    counts: [],
    total: 0,
    mine: null,
    voters: null,
  };
  const counts = new Map(base.counts.map((entry) => [entry.option_id, entry.votes]));
  if (base.mine !== null) {
    counts.set(base.mine, Math.max(0, (counts.get(base.mine) ?? 0) - 1));
  }
  if (optionId !== null) {
    counts.set(optionId, (counts.get(optionId) ?? 0) + 1);
  }
  const ordered = [...new Set([...base.counts.map((entry) => entry.option_id), ...counts.keys()])];
  return {
    ...base,
    counts: ordered.map((id) => ({ option_id: id, votes: counts.get(id) ?? 0 })),
    total: [...counts.values()].reduce((sum, votes) => sum + votes, 0),
    mine: optionId,
  };
}

export function pollProblem(config: PollConfig): string | null {
  if (config.question.trim() === '') return 'Ask a question.';
  if (config.options.length < POLL_MIN_OPTIONS) return 'A poll needs at least two options.';
  const texts = config.options.map((option) => option.text.trim().toLowerCase());
  if (texts.some((text) => text === '')) return 'Every option needs some text.';
  if (new Set(texts).size !== texts.length) return 'Each option needs its own text.';
  return null;
}
