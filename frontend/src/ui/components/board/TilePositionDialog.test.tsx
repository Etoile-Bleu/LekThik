import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TilePositionDialog } from './TilePositionDialog';

function renderDialog(props: Partial<React.ComponentProps<typeof TilePositionDialog>> = {}) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(
    <TilePositionDialog
      open
      name="Doing"
      kind="list"
      rect={{ x: 3, y: 1, w: 4, h: 8 }}
      onSave={onSave}
      onClose={onClose}
      {...props}
    />
  );
  return { onSave, onClose };
}

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('TilePositionDialog', () => {
  it('starts from where the tile is, counted from one', () => {
    renderDialog();

    expect(screen.getByLabelText('Column')).toHaveValue(4);
    expect(screen.getByLabelText('Row')).toHaveValue(2);
    expect(screen.getByLabelText('Width')).toHaveValue(4);
    expect(screen.getByLabelText('Height')).toHaveValue(8);
  });

  it('places the tile where the numbers say, counted from zero for the grid', () => {
    const { onSave, onClose } = renderDialog();

    type('Column', '1');
    type('Row', '1');
    type('Width', '6');
    type('Height', '10');
    fireEvent.click(screen.getByRole('button', { name: 'Place' }));

    expect(onSave).toHaveBeenCalledWith({ x: 0, y: 0, w: 6, h: 10 });
    expect(onClose).toHaveBeenCalled();
  });

  it('brings numbers that do not fit back to the nearest place that works', () => {
    const { onSave } = renderDialog();

    type('Column', '12');
    type('Width', '9');
    type('Height', '1');
    fireEvent.click(screen.getByRole('button', { name: 'Place' }));

    const saved = onSave.mock.calls[0][0];
    expect(saved.x + saved.w).toBeLessThanOrEqual(12);
    expect(saved.h).toBeGreaterThanOrEqual(5);
  });

  it('does not save while a field is empty or not a number', () => {
    const { onSave } = renderDialog();

    type('Width', '');
    expect(screen.getByRole('button', { name: 'Place' })).toBeDisabled();
    fireEvent.submit(
      screen.getByRole('button', { name: 'Place' }).closest('form') as HTMLFormElement
    );

    expect(onSave).not.toHaveBeenCalled();
  });

  it('draws a small picture of the grid for people who can see it, and describes it for those who cannot', () => {
    renderDialog();

    expect(
      screen.getByRole('img', { name: /column 4 of 12, row 2, 4 columns wide, 8 rows tall/ })
    ).toBeInTheDocument();
  });

  it('closes without saving', () => {
    const { onSave, onClose } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
