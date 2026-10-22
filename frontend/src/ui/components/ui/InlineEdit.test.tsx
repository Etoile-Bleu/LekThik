import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { InlineEdit } from './InlineEdit';

function setup(onCommit = vi.fn()) {
  render(<InlineEdit value="To do" label="list name" onCommit={onCommit} />);
  fireEvent.click(screen.getByRole('button', { name: /To do/ }));
  return { onCommit, input: screen.getByRole('textbox', { name: 'list name' }) };
}

describe('InlineEdit', () => {
  it('shows the value as a heading with a rename button', () => {
    render(<InlineEdit value="To do" label="list name" onCommit={() => undefined} />);

    expect(screen.getByRole('heading', { name: /To do/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'To do (rename list name)' })).toBeInTheDocument();
  });

  it('commits a trimmed new value on Enter', () => {
    const { onCommit, input } = setup();

    fireEvent.change(input, { target: { value: '  Doing  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledWith('Doing');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('commits on blur', () => {
    const { onCommit, input } = setup();

    fireEvent.change(input, { target: { value: 'Done' } });
    fireEvent.blur(input);

    expect(onCommit).toHaveBeenCalledWith('Done');
  });

  it('discards the draft on Escape', () => {
    const { onCommit, input } = setup();

    fireEvent.change(input, { target: { value: 'Something else' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('ignores blank and unchanged values', () => {
    const { onCommit, input } = setup();

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /To do/ }));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();
  });
});
