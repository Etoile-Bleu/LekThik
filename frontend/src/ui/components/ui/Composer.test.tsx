import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Composer } from './Composer';

function setup(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  render(
    <Composer
      triggerLabel="Add a card"
      inputLabel="Title of the new card"
      placeholder="Enter a title"
      submitLabel="Add card"
      multiline
      onSubmit={onSubmit}
    />
  );
  return onSubmit;
}

describe('Composer', () => {
  it('starts as a single trigger button', () => {
    setup();

    expect(screen.getByRole('button', { name: 'Add a card' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('opens a labelled field and keeps submit disabled until there is text', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add a card' }));

    expect(screen.getByRole('textbox', { name: 'Title of the new card' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add card' })).toBeDisabled();
  });

  it('submits on Enter, clears the field and stays open for the next entry', async () => {
    const onSubmit = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add a card' }));
    const field = screen.getByRole('textbox', { name: 'Title of the new card' });

    fireEvent.change(field, { target: { value: '  Write docs  ' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Write docs'));
    await waitFor(() => expect(field).toHaveValue(''));
    expect(screen.getByRole('textbox', { name: 'Title of the new card' })).toBeInTheDocument();
  });

  it('does not submit on Shift+Enter', () => {
    const onSubmit = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add a card' }));
    const field = screen.getByRole('textbox', { name: 'Title of the new card' });

    fireEvent.change(field, { target: { value: 'Line' } });
    fireEvent.keyDown(field, { key: 'Enter', shiftKey: true });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('closes on Escape without submitting', () => {
    const onSubmit = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add a card' }));
    const field = screen.getByRole('textbox', { name: 'Title of the new card' });

    fireEvent.change(field, { target: { value: 'Draft' } });
    fireEvent.keyDown(field, { key: 'Escape' });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add a card' })).toBeInTheDocument();
  });
});
