import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BlockedBadge } from './BlockedBadge';

const NOW = new Date('2026-10-22T12:00:00Z').getTime();
const SINCE = new Date(NOW - 2 * 86_400_000).toISOString();

describe('BlockedBadge', () => {
  it('says blocked in words, not only with the stop-sign icon', () => {
    render(<BlockedBadge since={SINCE} reason={null} now={NOW} />);

    expect(screen.getByText('Blocked', { selector: '[aria-hidden="true"]' })).toBeInTheDocument();
    expect(screen.getByText('Blocked for 2 days')).toHaveClass('sr-only');
  });

  it('carries the reason for a screen reader when there is one', () => {
    render(<BlockedBadge since={SINCE} reason="Waiting on design" now={NOW} />);

    expect(screen.getByText('Blocked for 2 days: Waiting on design')).toBeInTheDocument();
  });
});
