import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LabelChip } from './LabelChip';

describe('LabelChip', () => {
  it('shows the name and announces the priority in words, not only by color', () => {
    render(<LabelChip name="Blocker" color="red" priority="urgent" />);

    expect(screen.getByText('Blocker')).toBeInTheDocument();
    expect(screen.getByText(/urgent/i)).toHaveClass('sr-only');
  });

  it('adds no priority text for labels without priority', () => {
    const { container } = render(<LabelChip name="Idea" color="teal" priority="none" />);

    expect(container.querySelector('.sr-only')).toBeNull();
    expect(container.querySelector('.priority-bars')).toBeNull();
  });

  it('draws as many filled bars as the priority level', () => {
    const { container } = render(<LabelChip name="High" color="orange" priority="high" />);

    const bars = Array.from(container.querySelectorAll('.priority-bars rect'));
    const filled = bars.filter((bar) => bar.getAttribute('opacity') === '1');
    expect(bars).toHaveLength(4);
    expect(filled).toHaveLength(3);
  });
});
