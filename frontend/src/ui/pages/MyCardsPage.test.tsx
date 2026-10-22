import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@lib/boardsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@lib/boardsApi')>();
  return { ...actual, fetchMyCards: vi.fn() };
});
vi.mock('@hooks/useToday', () => ({ useToday: () => '2026-10-22' }));

import * as api from '@lib/boardsApi';
import { resetMyCards } from '@lib/myCardsStore';

import { MyCardsPage } from './MyCardsPage';

function card(id: string, due: string | null, workspace = 'w1'): api.AssignedCard {
  return {
    id,
    title: `Card ${id}`,
    due_date: due,
    list_id: 'l1',
    list_name: 'Doing',
    board_id: 'b1',
    board_name: 'Launch',
    workspace_id: workspace,
    workspace_name: workspace === 'w1' ? 'Studio' : 'Side project',
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MyCardsPage />
    </MemoryRouter>
  );
}

describe('MyCardsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMyCards();
  });

  it('groups the cards by urgency with overdue first', async () => {
    vi.mocked(api.fetchMyCards).mockResolvedValue([
      card('later', '2026-12-01'),
      card('late', '2026-10-01'),
      card('today', '2026-10-22'),
      card('none', null),
    ]);

    renderPage();

    await screen.findByRole('heading', { level: 2, name: /Overdue/ });
    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual([
      expect.stringContaining('Overdue'),
      expect.stringContaining('Today'),
      expect.stringContaining('Later'),
      expect.stringContaining('No date'),
    ]);
  });

  it('makes each card a link that opens it on its board', async () => {
    vi.mocked(api.fetchMyCards).mockResolvedValue([card('c1', '2026-10-23')]);

    renderPage();

    const link = await screen.findByRole('link', { name: /Card c1/ });
    expect(link).toHaveAttribute('href', '/b/b1?card=c1');
    expect(link).toHaveTextContent('Studio');
    expect(link).toHaveTextContent('Launch');
    expect(link).toHaveTextContent('Doing');
  });

  it('counts the cards in words', async () => {
    vi.mocked(api.fetchMyCards).mockResolvedValue([card('a', null), card('b', null)]);

    renderPage();

    expect(await screen.findByText('2 cards assigned to you.')).toBeInTheDocument();
  });

  it('says so, kindly, when nothing is assigned', async () => {
    vi.mocked(api.fetchMyCards).mockResolvedValue([]);

    renderPage();

    expect(await screen.findByText('All clear')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse your workspaces' })).toHaveAttribute(
      'href',
      '/dashboard'
    );
  });

  it('offers to try again when loading fails', async () => {
    vi.mocked(api.fetchMyCards).mockRejectedValueOnce(new Error('offline'));
    vi.mocked(api.fetchMyCards).mockResolvedValueOnce([card('c1', null)]);

    renderPage();

    expect(await screen.findByText('Could not load your cards')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('link', { name: /Card c1/ })).toBeInTheDocument();
  });

  it('filters by workspace only when there is more than one', async () => {
    vi.mocked(api.fetchMyCards).mockResolvedValue([card('a', null, 'w1'), card('b', null, 'w2')]);

    renderPage();

    const select = await screen.findByLabelText('Workspace');
    expect(screen.getAllByRole('link')).toHaveLength(2);
    fireEvent.change(select, { target: { value: 'w2' } });

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(within(links[0]).getByText('Card b')).toBeInTheDocument();
  });

  it('shows no workspace filter for a single workspace', async () => {
    vi.mocked(api.fetchMyCards).mockResolvedValue([card('a', null)]);

    renderPage();

    await screen.findByRole('link', { name: /Card a/ });
    await waitFor(() => expect(screen.queryByLabelText('Workspace')).not.toBeInTheDocument());
  });
});
