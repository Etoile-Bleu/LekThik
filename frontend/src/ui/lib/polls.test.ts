import { describe, expect, it } from 'vitest';

import type { PollConfig, PollTally } from './boardsApi';
import {
  DEFAULT_POLL,
  applyVote,
  leaders,
  newOptionId,
  pollProblem,
  sharePercent,
  votesFor,
} from './polls';

const tally: PollTally = {
  list_id: 'p',
  counts: [
    { option_id: 'a', votes: 2 },
    { option_id: 'b', votes: 2 },
    { option_id: 'c', votes: 0 },
  ],
  total: 4,
  mine: 'a',
  voters: null,
};

const config: PollConfig = {
  ...DEFAULT_POLL,
  options: [
    { id: 'a', text: 'A' },
    { id: 'b', text: 'B' },
    { id: 'c', text: 'C' },
  ],
};

describe('polls', () => {
  it('reads the votes of an option and rounds its share', () => {
    expect(votesFor(tally, 'a')).toBe(2);
    expect(votesFor(undefined, 'a')).toBe(0);
    expect(sharePercent(1, 3)).toBe(33);
    expect(sharePercent(0, 0)).toBe(0);
  });

  it('names every option tied for the lead, and none before a vote', () => {
    expect(leaders(config, tally)).toEqual(['a', 'b']);
    expect(leaders(config, undefined)).toEqual([]);
    expect(leaders(config, { ...tally, total: 0 })).toEqual([]);
  });

  it('moves a vote from one option to another', () => {
    const moved = applyVote(tally, 'p', 'c');

    expect(votesFor(moved, 'a')).toBe(1);
    expect(votesFor(moved, 'c')).toBe(1);
    expect(moved.total).toBe(4);
    expect(moved.mine).toBe('c');
  });

  it('adds a first vote and withdraws one', () => {
    const first = applyVote(undefined, 'p', 'b');
    expect(first.total).toBe(1);
    expect(first.mine).toBe('b');

    const gone = applyVote(first, 'p', null);
    expect(gone.total).toBe(0);
    expect(gone.mine).toBeNull();
    expect(votesFor(gone, 'b')).toBe(0);
  });

  it('hands out option ids that are not taken', () => {
    expect(newOptionId(['o0', 'o1'])).toBe('o2');
    expect(newOptionId([])).toBe('o0');
  });

  it('says what is wrong with a poll before it is sent', () => {
    expect(pollProblem(config)).toBeNull();
    expect(pollProblem({ ...config, question: '  ' })).toMatch(/question/);
    expect(pollProblem({ ...config, options: config.options.slice(0, 1) })).toMatch(/two/);
    expect(
      pollProblem({ ...config, options: [config.options[0], { id: 'z', text: ' ' }] })
    ).toMatch(/text/);
    expect(
      pollProblem({ ...config, options: [config.options[0], { id: 'z', text: 'a' }] })
    ).toMatch(/own/);
  });
});
