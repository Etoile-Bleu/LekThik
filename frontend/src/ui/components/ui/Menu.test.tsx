import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Menu } from './Menu';

function renderMenu(onSelect = vi.fn()) {
  render(
    <Menu
      label="List actions"
      items={[
        { label: 'Move left', onSelect: () => undefined, disabled: true },
        { label: 'Move right', onSelect },
        { label: 'Delete list', onSelect: () => undefined, tone: 'danger' },
      ]}
    />
  );
  return onSelect;
}

describe('Menu', () => {
  it('opens a menu of items from its trigger', () => {
    renderMenu();

    const trigger = screen.getByRole('button', { name: 'List actions' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'List actions' })).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
  });

  it('focuses the first enabled item and moves with the arrow keys, skipping disabled ones', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'List actions' }));

    const moveRight = screen.getByRole('menuitem', { name: 'Move right' });
    const deleteList = screen.getByRole('menuitem', { name: 'Delete list' });
    expect(moveRight).toHaveFocus();

    fireEvent.keyDown(moveRight, { key: 'ArrowDown' });
    expect(deleteList).toHaveFocus();

    fireEvent.keyDown(deleteList, { key: 'ArrowDown' });
    expect(moveRight).toHaveFocus();

    fireEvent.keyDown(moveRight, { key: 'End' });
    expect(deleteList).toHaveFocus();
  });

  it('closes on Escape and gives focus back to the trigger', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'List actions' });
    fireEvent.click(trigger);

    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Move right' }), { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('runs the selected action and closes', () => {
    const onSelect = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'List actions' }));

    fireEvent.click(screen.getByRole('menuitem', { name: 'Move right' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes when the user clicks elsewhere', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'List actions' }));

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens inside the modal dialog that holds its trigger so it stays on top and usable', () => {
    render(
      <dialog open aria-label="Drawer">
        <Menu label="Drawer actions" items={[{ label: 'Rename', onSelect: () => undefined }]} />
      </dialog>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Drawer actions' }));

    const menu = screen.getByRole('menu', { name: 'Drawer actions' });
    expect(menu.closest('dialog')).toBe(screen.getByRole('dialog', { name: 'Drawer' }));
  });

  it('closes on Escape even when the focus is still on the trigger', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'List actions' });
    fireEvent.click(trigger);
    trigger.focus();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
