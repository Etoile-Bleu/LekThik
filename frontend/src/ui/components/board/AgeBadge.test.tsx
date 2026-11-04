import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AgeBadge } from './AgeBadge';

const NOW = new Date('2026-10-22T12:00:00Z').getTime();

function daysAgo(days: number): string {
  return new Date(NOW - days * 86_400_000).toISOString();
}

describe('AgeBadge', () => {
  it('says nothing for a fresh card', () => {
    const { container } = render(<AgeBadge since={daysAgo(0.5)} now={NOW} />);

    expect(container.querySelector('.age-badge')).toBeNull();
  });

  it('shows a quiet badge once the card has sat for a couple of days', () => {
    const { container } = render(<AgeBadge since={daysAgo(3)} now={NOW} />);

    expect(container.querySelector('.age-badge')).toHaveAttribute('data-state', 'normal');
    expect(screen.getByText('3d', { selector: '[aria-hidden="true"]' })).toBeInTheDocument();
  });

  it('flags a card stale once it has sat long enough, in words and not only in colour', () => {
    const { container } = render(<AgeBadge since={daysAgo(6)} now={NOW} />);

    expect(container.querySelector('.age-badge')).toHaveAttribute('data-state', 'stale');
    expect(screen.getByText(/^In this list for 6 days, since /)).toBeInTheDocument();
  });
});
