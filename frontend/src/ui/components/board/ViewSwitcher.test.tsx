import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ViewSwitcher } from './ViewSwitcher';

describe('ViewSwitcher', () => {
  it('offers the four views as one radio group with the current one checked', () => {
    render(<ViewSwitcher value="list" onChange={vi.fn()} />);

    expect(screen.getByRole('radiogroup', { name: 'Board view' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'List' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Board' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Canvas' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Calendar' })).not.toBeChecked();
  });

  it('switches view on click', () => {
    const onChange = vi.fn();
    render(<ViewSwitcher value="board" onChange={onChange} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Calendar' }));

    expect(onChange).toHaveBeenCalledWith('calendar');
  });

  it('moves between views with the arrow keys', () => {
    const onChange = vi.fn();
    render(<ViewSwitcher value="board" onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole('radio', { name: 'Board' }), { key: 'ArrowRight' });

    expect(onChange).toHaveBeenCalledWith('canvas');
  });

  it('keeps only the current view in the tab order', () => {
    render(<ViewSwitcher value="calendar" onChange={vi.fn()} />);

    expect(screen.getByRole('radio', { name: 'Calendar' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Board' })).toHaveAttribute('tabindex', '-1');
  });
});
