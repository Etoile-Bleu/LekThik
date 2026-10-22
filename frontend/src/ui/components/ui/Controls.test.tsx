import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Popover } from './Popover';
import { Segmented } from './Segmented';
import { Switch } from './Switch';

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
] as const;

function Harness({ onChange = vi.fn() }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState<'a' | 'b' | 'c'>('a');
  return (
    <Segmented
      label="Letters"
      value={value}
      options={[...options]}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe('Segmented', () => {
  it('is a radio group with only the chosen option in the tab order', () => {
    render(<Harness />);

    expect(screen.getByRole('radiogroup', { name: 'Letters' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'Beta' })).toHaveAttribute('tabindex', '-1');
  });

  it('moves the choice with the arrow keys, wrapping around, and with Home and End', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const first = screen.getByRole('radio', { name: 'Alpha' });

    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('b');

    fireEvent.keyDown(screen.getByRole('radio', { name: 'Beta' }), { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('c');

    fireEvent.keyDown(screen.getByRole('radio', { name: 'Gamma' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('a');

    fireEvent.keyDown(screen.getByRole('radio', { name: 'Alpha' }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('c');
  });

  it('changes on click', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.click(screen.getByRole('radio', { name: 'Gamma' }));

    expect(onChange).toHaveBeenCalledWith('c');
  });
});

describe('Switch', () => {
  it('is a switch that reports its state and flips on click', () => {
    const onChange = vi.fn();
    render(
      <Switch
        label="Reduce motion"
        hint="Turns animations off."
        checked={false}
        onChange={onChange}
      />
    );
    const control = screen.getByRole('switch', { name: /Reduce motion/ });

    expect(control).toHaveAttribute('aria-checked', 'false');
    expect(control).toHaveAccessibleName(/Turns animations off/);

    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does nothing when disabled', () => {
    const onChange = vi.fn();
    render(<Switch label="Locked" checked disabled onChange={onChange} />);

    fireEvent.click(screen.getByRole('switch', { name: 'Locked' }));

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Popover', () => {
  it('opens a named panel, moves focus into it, closes on Escape and returns focus', () => {
    render(
      <Popover label="Display options" trigger="Display">
        {() => <button type="button">Inside</button>}
      </Popover>
    );
    const trigger = screen.getByRole('button', { name: 'Display' });

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Display options' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes when the pointer goes down outside it', () => {
    render(
      <div>
        <p>Elsewhere</p>
        <Popover label="Panel" trigger="Open">
          {() => <span>Content</span>}
        </Popover>
      </div>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByText('Elsewhere'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lets the content close it', () => {
    render(
      <Popover label="Panel" trigger="Open">
        {(close) => (
          <button type="button" onClick={close}>
            Done
          </button>
        )}
      </Popover>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
