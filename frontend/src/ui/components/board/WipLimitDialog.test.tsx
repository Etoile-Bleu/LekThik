import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WipLimitDialog } from './WipLimitDialog';

function setup(current: number | null = null) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(
    <WipLimitDialog
      open
      listName="Doing"
      current={current}
      cardCount={3}
      onSave={onSave}
      onClose={onClose}
    />
  );
  return { onSave, onClose };
}

describe('WipLimitDialog', () => {
  it('explains what a limit does, and that it never blocks', () => {
    setup();

    expect(screen.getByText(/still accepts cards/)).toBeInTheDocument();
    expect(screen.getByText(/holds 3 cards now/)).toBeInTheDocument();
  });

  it('saves the number and closes', () => {
    const { onSave, onClose } = setup();

    fireEvent.change(screen.getByLabelText('Most cards at once'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith(4);
    expect(onClose).toHaveBeenCalled();
  });

  it('starts from the current limit', () => {
    setup(5);

    expect(screen.getByLabelText('Most cards at once')).toHaveValue('5');
  });

  it('removes the limit with an empty field or with the button', () => {
    const first = setup(5);
    fireEvent.change(screen.getByLabelText('Most cards at once'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(first.onSave).toHaveBeenCalledWith(null);
  });

  it('has a remove button only when there is a limit to remove', () => {
    const { onSave } = setup(5);

    fireEvent.click(screen.getByRole('button', { name: 'Remove limit' }));

    expect(onSave).toHaveBeenCalledWith(null);
  });

  it('does not offer to remove a limit that is not there', () => {
    setup(null);

    expect(screen.queryByRole('button', { name: 'Remove limit' })).not.toBeInTheDocument();
  });

  it('refuses a value that is not a limit and says what is expected', () => {
    const { onSave, onClose } = setup();
    const field = screen.getByLabelText('Most cards at once');

    for (const bad of ['0', '100', 'many', '2.5']) {
      fireEvent.change(field, { target: { value: bad } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(screen.getByRole('alert')).toHaveTextContent('whole number from 1 to 99');
      expect(field).toHaveAttribute('aria-invalid', 'true');
    }

    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
