import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BoardMetaProvider } from '@hooks/useBoardMeta';
import type { CardSummary } from '@lib/boardsApi';

import { CardFace } from './BoardCard';

function card(extra: Partial<CardSummary> = {}): CardSummary {
  return {
    id: 'c',
    list_id: 'l',
    title: 'Ship it',
    has_description: false,
    description_preview: '',
    label_ids: [],
    assignee_ids: [],
    due_date: null,
    ...extra,
  };
}

function face(extra: Partial<CardSummary>) {
  return render(
    <BoardMetaProvider members={[]} meId={undefined} today="2026-10-28">
      <CardFace card={card(extra)} labels={[]} />
    </BoardMetaProvider>
  );
}

describe('the face of a card', () => {
  it('shows how many comments it has, in words for a screen reader', () => {
    face({ comment_count: 3 });

    expect(screen.getByText('3 comments')).toHaveClass('sr-only');
    expect(screen.getByText('3', { selector: '[aria-hidden="true"]' })).toBeInTheDocument();
  });

  it('says comment in the singular', () => {
    face({ comment_count: 1 });

    expect(screen.getByText('1 comment')).toBeInTheDocument();
  });

  it('shows nothing for no comments, or for a card from an older answer', () => {
    face({ comment_count: 0 });
    expect(screen.queryByText(/comment/)).toBeNull();
  });

  it('keeps the title when nothing else is shown', () => {
    face({});

    expect(screen.getByText('Ship it')).toBeInTheDocument();
    expect(document.querySelector('.board-card__comments')).toBeNull();
  });

  it('flags a blocked card in words, not only in colour', () => {
    face({ blocked_since: new Date().toISOString(), blocked_reason: 'Waiting on design' });

    expect(screen.getByText('Blocked', { selector: '[aria-hidden="true"]' })).toBeInTheDocument();
    expect(document.querySelector('.blocked-badge')).toHaveAttribute(
      'title',
      expect.stringContaining('Waiting on design')
    );
  });

  it('says nothing about a fresh card, and shows age once it has sat a while', () => {
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

    face({ list_entered_at: daysAgo(0.1) });
    expect(document.querySelector('.age-badge')).toBeNull();

    face({ list_entered_at: daysAgo(6) });
    expect(document.querySelector('.age-badge')).toHaveAttribute('data-state', 'stale');
  });
});
