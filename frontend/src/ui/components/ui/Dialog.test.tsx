import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('renders its content in an accessible dialog when open', () => {
    render(
      <Dialog open onClose={() => undefined} title="Rename card">
        <p>Dialog body</p>
      </Dialog>
    );

    expect(screen.getByRole('dialog', { name: 'Rename card' })).toBeInTheDocument();
    expect(screen.getByText('Dialog body')).toBeInTheDocument();
  });

  it('renders nothing inside while closed', () => {
    render(
      <Dialog open={false} onClose={() => undefined} title="Rename card">
        <p>Dialog body</p>
      </Dialog>
    );

    expect(screen.queryByText('Dialog body')).not.toBeInTheDocument();
  });

  it('closes from the close button', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Rename card">
        <p>Dialog body</p>
      </Dialog>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the backdrop is clicked but not when the content is', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Rename card">
        <p>Dialog body</p>
      </Dialog>
    );

    fireEvent.click(screen.getByText('Dialog body'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('dialog', { name: 'Rename card' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('can hide the close button', () => {
    render(
      <Dialog open onClose={() => undefined} title="Confirm" showClose={false}>
        <p>Dialog body</p>
      </Dialog>
    );

    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });
});
