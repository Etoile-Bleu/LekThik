import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useHistoryStore } from '@lib/history';

import { UndoRedoButtons } from './UndoRedoButtons';

describe('UndoRedoButtons', () => {
  beforeEach(() => {
    useHistoryStore.getState().clear();
  });

  it('are off while there is nothing to undo or redo', () => {
    render(<UndoRedoButtons />);

    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
  });

  it('name the change they would undo, and undo then redo it', async () => {
    const undo = vi.fn(async () => undefined);
    const redo = vi.fn(async () => undefined);
    useHistoryStore.getState().record({ label: 'Move card', undo, redo });
    render(<UndoRedoButtons />);

    fireEvent.click(screen.getByRole('button', { name: 'Undo Move card' }));
    await waitFor(() => expect(undo).toHaveBeenCalled());

    fireEvent.click(await screen.findByRole('button', { name: 'Redo Move card' }));
    await waitFor(() => expect(redo).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Redo' })).toBeDisabled();
  });
});
