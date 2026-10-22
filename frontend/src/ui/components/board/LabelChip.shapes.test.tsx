import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { LabelColor } from '@lib/boardsApi';

import { LabelChip } from './LabelChip';

const COLORS: LabelColor[] = [
  'slate',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'violet',
  'pink',
];

describe('LabelChip shapes', () => {
  it('gives every colour its own shape, so colour is never the only clue', () => {
    const shapes = COLORS.map((color) => {
      const { container } = render(<LabelChip name={color} color={color} priority="none" />);
      return container.querySelector('.label-chip__shape')?.getAttribute('data-shape');
    });

    expect(shapes.every(Boolean)).toBe(true);
    expect(new Set(shapes).size).toBe(COLORS.length);
  });

  it('hides the shape from screen readers, the name carries the meaning', () => {
    const { container } = render(<LabelChip name="Urgent" color="red" priority="urgent" />);

    expect(container.querySelector('.label-chip__shape')).toHaveAttribute('aria-hidden', 'true');
  });
});
