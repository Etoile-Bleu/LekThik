import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BlockedField } from './BlockedField';

const NOW = new Date('2026-10-22T12:00:00Z').getTime();

describe('BlockedField', () => {
  it('toggles blocked on, with no reason field until it is on', () => {
    const onToggle = vi.fn();
    render(
      <BlockedField
        editable
        blockedSince={null}
        reason={null}
        now={NOW}
        onToggle={onToggle}
        onReasonChange={vi.fn()}
      />
    );

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: /^Blocked/ }));

    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('shows the reason field once blocked and commits an edit on blur', () => {
    const onReasonChange = vi.fn();
    render(
      <BlockedField
        editable
        blockedSince="2026-10-20T00:00:00Z"
        reason={null}
        now={NOW}
        onToggle={vi.fn()}
        onReasonChange={onReasonChange}
      />
    );

    const field = screen.getByRole('textbox', { name: /why this card is blocked/i });
    fireEvent.change(field, { target: { value: 'Waiting on design' } });
    fireEvent.blur(field);

    expect(onReasonChange).toHaveBeenCalledWith('Waiting on design');
  });

  it('does not call back when the reason did not actually change', () => {
    const onReasonChange = vi.fn();
    render(
      <BlockedField
        editable
        blockedSince="2026-10-20T00:00:00Z"
        reason="Already blocked"
        now={NOW}
        onToggle={vi.fn()}
        onReasonChange={onReasonChange}
      />
    );

    fireEvent.blur(screen.getByRole('textbox', { name: /why this card is blocked/i }));

    expect(onReasonChange).not.toHaveBeenCalled();
  });

  it('clears an emptied reason as null rather than an empty string', () => {
    const onReasonChange = vi.fn();
    render(
      <BlockedField
        editable
        blockedSince="2026-10-20T00:00:00Z"
        reason="Waiting on design"
        now={NOW}
        onToggle={vi.fn()}
        onReasonChange={onReasonChange}
      />
    );

    const field = screen.getByRole('textbox', { name: /why this card is blocked/i });
    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.blur(field);

    expect(onReasonChange).toHaveBeenCalledWith(null);
  });

  it('disables the switch and the reason field for a reader', () => {
    render(
      <BlockedField
        editable={false}
        blockedSince="2026-10-20T00:00:00Z"
        reason="Waiting on design"
        now={NOW}
        onToggle={vi.fn()}
        onReasonChange={vi.fn()}
      />
    );

    expect(screen.getByRole('switch', { name: /^Blocked/ })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: /why this card is blocked/i })).toHaveAttribute(
      'readonly'
    );
  });
});
