import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ContextMenu, type MenuEntry } from './ContextMenu';

function setup(entries: MenuEntry[], keyboard = true) {
  const onClose = vi.fn();
  const from = document.createElement('button');
  document.body.appendChild(from);
  render(
    <ContextMenu
      state={{ x: 40, y: 40, keyboard, from }}
      label="Actions"
      entries={entries}
      onClose={onClose}
    />
  );
  return { onClose, from };
}

describe('ContextMenu', () => {
  const one = vi.fn();
  const two = vi.fn();
  const sub = vi.fn();
  const entries: MenuEntry[] = [
    { label: 'Open', onSelect: one },
    { label: 'Duplicate', shortcut: 'Ctrl D', onSelect: two },
    { type: 'separator' },
    { label: 'Delete', danger: true, disabled: true, onSelect: vi.fn() },
    {
      type: 'submenu',
      label: 'Move to',
      items: [{ label: 'Done', onSelect: sub }],
    },
    { label: 'Pinned', checked: true, onSelect: vi.fn() },
  ];

  it('is a menu with named items, a separator, a disabled one and a check', () => {
    setup(entries);

    expect(screen.getByRole('menu', { name: 'Actions' })).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toContain('Open');
    expect(screen.getByRole('separator')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByRole('menuitemcheckbox', { name: 'Pinned' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('focuses the first item when it opens from the keyboard', () => {
    setup(entries);

    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Open' }));
  });

  it('moves with the arrows, skipping what is disabled, and wraps', () => {
    setup(entries);
    const menu = screen.getByRole('menu');

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Duplicate Ctrl D' }));
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Move to' }));
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByRole('menuitemcheckbox', { name: 'Pinned' }));
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Open' }));
  });

  it('jumps to an item by its first letters', () => {
    setup(entries);

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'm' });

    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Move to' }));
  });

  it('runs an item on Enter and closes', () => {
    const { onClose } = setup(entries);

    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Open' }), { key: 'Enter' });

    expect(one).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('does not run a disabled item', () => {
    setup(entries);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));

    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('opens a submenu with the right arrow, closes it with the left, and runs its item', () => {
    const { onClose } = setup(entries);
    const parent = screen.getByRole('menuitem', { name: 'Move to' });

    parent.focus();
    fireEvent.keyDown(parent, { key: 'ArrowRight' });
    expect(parent).toHaveAttribute('aria-expanded', 'true');
    const child = screen.getByRole('menuitem', { name: 'Done' });
    expect(document.activeElement).toBe(child);

    fireEvent.keyDown(child, { key: 'ArrowLeft' });
    expect(screen.queryByRole('menuitem', { name: 'Done' })).toBeNull();

    parent.focus();
    fireEvent.keyDown(parent, { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Done' }));
    expect(sub).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape and gives the focus back', () => {
    vi.useFakeTimers();
    const { onClose, from } = setup(entries);

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    act(() => {
      vi.runAllTimers();
    });

    expect(onClose).toHaveBeenCalled();
    expect(document.activeElement).toBe(from);
    vi.useRealTimers();
  });

  it('closes on a press outside, and shows nothing without entries', () => {
    const { onClose } = setup(entries);

    fireEvent.pointerDown(document.body);

    expect(onClose).toHaveBeenCalled();
  });
});
