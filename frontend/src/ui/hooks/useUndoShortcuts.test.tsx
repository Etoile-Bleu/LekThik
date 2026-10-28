import { fireEvent, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useHistoryStore } from '@lib/history';

import { useUndoShortcuts } from './useUndoShortcuts';

function Host({ field }: { field?: 'input' | 'textarea' | 'editable' | 'radio' | 'checkbox' }) {
  useUndoShortcuts();
  if (field === 'input') return <input aria-label="field" />;
  if (field === 'radio') return <input type="radio" aria-label="field" />;
  if (field === 'checkbox') return <input type="checkbox" aria-label="field" />;
  if (field === 'textarea') return <textarea aria-label="field" />;
  if (field === 'editable')
    return <div aria-label="field" contentEditable suppressContentEditableWarning />;
  return <button type="button">Plain</button>;
}

const settled = () => vi.waitFor(() => expect(useHistoryStore.getState().busy).toBe(false));

function setup(field?: 'input' | 'textarea' | 'editable' | 'radio' | 'checkbox') {
  const undo = vi.fn(async () => undefined);
  const redo = vi.fn(async () => undefined);
  useHistoryStore.getState().clear();
  useHistoryStore.getState().record({ label: 'Thing', undo, redo });
  const { container } = render(<Host field={field} />);
  return { undo, redo, target: container.firstElementChild as HTMLElement };
}

describe('useUndoShortcuts', () => {
  beforeEach(() => {
    useHistoryStore.getState().clear();
  });

  it('undoes with Ctrl+Z and Cmd+Z', async () => {
    const { undo, target } = setup();

    fireEvent.keyDown(target, { key: 'z', ctrlKey: true });
    await vi.waitFor(() => expect(undo).toHaveBeenCalledTimes(1));
    await settled();

    useHistoryStore.getState().record({ label: 'Again', undo, redo: vi.fn() });
    fireEvent.keyDown(target, { key: 'z', metaKey: true });
    await vi.waitFor(() => expect(undo).toHaveBeenCalledTimes(2));
  });

  it('redoes with Ctrl+Shift+Z, Cmd+Shift+Z and Ctrl+Y', async () => {
    const { redo, target } = setup();
    await useHistoryStore.getState().undo();

    fireEvent.keyDown(target, { key: 'Z', ctrlKey: true, shiftKey: true });
    await vi.waitFor(() => expect(redo).toHaveBeenCalledTimes(1));
    await settled();

    await useHistoryStore.getState().undo();
    fireEvent.keyDown(target, { key: 'z', metaKey: true, shiftKey: true });
    await vi.waitFor(() => expect(redo).toHaveBeenCalledTimes(2));
    await settled();

    await useHistoryStore.getState().undo();
    fireEvent.keyDown(target, { key: 'y', ctrlKey: true });
    await vi.waitFor(() => expect(redo).toHaveBeenCalledTimes(3));
  });

  it('takes the key over from the browser, so the page does not undo too', () => {
    const { target } = setup();

    const notPrevented = fireEvent.keyDown(target, { key: 'z', ctrlKey: true });

    expect(notPrevented).toBe(false);
  });

  it.each(['input', 'textarea', 'editable'] as const)(
    'leaves Ctrl+Z to the browser inside a %s, which undoes the typing',
    (field) => {
      const { undo, target } = setup(field);

      const notPrevented = fireEvent.keyDown(target, { key: 'z', ctrlKey: true });

      expect(notPrevented).toBe(true);
      expect(undo).not.toHaveBeenCalled();
    }
  );

  it.each(['radio', 'checkbox'] as const)(
    'still undoes the board while a %s has the focus, since there is no text to undo',
    async (field) => {
      const { undo, target } = setup(field);

      const notPrevented = fireEvent.keyDown(target, { key: 'z', ctrlKey: true });

      expect(notPrevented).toBe(false);
      await vi.waitFor(() => expect(undo).toHaveBeenCalledTimes(1));
    }
  );

  it('ignores a bare Z, Alt combinations and other keys', () => {
    const { undo, target } = setup();

    fireEvent.keyDown(target, { key: 'z' });
    fireEvent.keyDown(target, { key: 'z', ctrlKey: true, altKey: true });
    fireEvent.keyDown(target, { key: 'x', ctrlKey: true });
    fireEvent.keyDown(target, { key: 'y', ctrlKey: true, shiftKey: true });

    expect(undo).not.toHaveBeenCalled();
  });
});
