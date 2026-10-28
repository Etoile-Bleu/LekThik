import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sampleBoardView } from '../../../../test/fixtures';

vi.mock('@lib/pollApi', () => ({ castVote: vi.fn(), withdrawVote: vi.fn() }));

import type { BoardList, PollTally } from '@lib/boardsApi';
import { useBoardStore } from '@lib/boardStore';
import * as pollApi from '@lib/pollApi';

import { PollBlock } from './PollBlock';

const poll: BoardList = {
  id: 'p1',
  name: 'Lunch',
  wip_limit: null,
  kind: 'poll',
  cards: [],
  config: {
    size: 'normal',
    question: 'Where do we eat?',
    options: [
      { id: 'pizza', text: 'Pizza' },
      { id: 'ramen', text: 'Ramen' },
    ],
    show_voters: false,
    closed: false,
  },
};

function setup(tally?: Partial<PollTally>, config: Partial<BoardList['config']> = {}) {
  const block = { ...poll, config: { ...poll.config, ...config } };
  useBoardStore.setState({
    view: {
      ...sampleBoardView(),
      lists: [block],
      polls: tally
        ? [{ list_id: 'p1', counts: [], total: 0, mine: null, voters: null, ...tally }]
        : [],
    },
    status: 'ready',
    freshIds: [],
  });
  render(<PollBlock block={block} />);
}

describe('PollBlock', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows the question, the options and the votes in words', () => {
    setup({
      counts: [
        { option_id: 'pizza', votes: 3 },
        { option_id: 'ramen', votes: 1 },
      ],
      total: 4,
      mine: 'ramen',
    });

    expect(screen.getByText('Where do we eat?')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Pizza/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /Ramen/ })).toBeChecked();
    expect(screen.getByText(/3 votes/)).toBeInTheDocument();
    expect(screen.getByText(/4 votes, anonymous/)).toBeInTheDocument();
  });

  it('casts a vote at once and keeps it when the server agrees', async () => {
    vi.mocked(pollApi.castVote).mockResolvedValueOnce(undefined);
    setup();

    fireEvent.click(screen.getByRole('radio', { name: /Pizza/ }));

    expect(screen.getByRole('radio', { name: /Pizza/ })).toBeChecked();
    await waitFor(() => expect(pollApi.castVote).toHaveBeenCalledWith('p1', 'pizza'));
    expect(useBoardStore.getState().view?.polls?.[0].total).toBe(1);
  });

  it('puts the vote back when the server refuses it', async () => {
    vi.mocked(pollApi.castVote).mockRejectedValueOnce(new Error('closed'));
    setup({ counts: [{ option_id: 'ramen', votes: 1 }], total: 1, mine: 'ramen' });

    fireEvent.click(screen.getByRole('radio', { name: /Pizza/ }));

    await waitFor(() => expect(screen.getByRole('radio', { name: /Ramen/ })).toBeChecked());
  });

  it('withdraws a vote', async () => {
    vi.mocked(pollApi.withdrawVote).mockResolvedValueOnce(undefined);
    setup({ counts: [{ option_id: 'ramen', votes: 1 }], total: 1, mine: 'ramen' });

    fireEvent.click(screen.getByRole('button', { name: 'Remove my vote' }));

    await waitFor(() => expect(pollApi.withdrawVote).toHaveBeenCalledWith('p1'));
    expect(screen.queryByRole('button', { name: 'Remove my vote' })).not.toBeInTheDocument();
  });

  it('takes no vote once closed, and says so', () => {
    setup({ total: 0 }, { closed: true });

    expect(screen.getByRole('radio', { name: /Pizza/ })).toBeDisabled();
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });
});
