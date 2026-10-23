import { useEffect, useRef, useState } from 'react';

import { ContextMenu, type ContextMenuState } from '../ui/ContextMenu';
import {
  type BoardContext,
  type ContextTarget,
  boardContextEntries,
  contextMenuLabel,
} from './boardContextMenu';

interface BoardContextHostProps {
  /** The work area, once it is on screen. */
  container: HTMLElement | null;
  context: BoardContext;
}

const LONG_PRESS_MS = 520;
const LONG_PRESS_SLOP = 8;

function targetOf(element: Element): ContextTarget {
  const card = element.closest<HTMLElement>('[data-card-id]');
  if (card?.dataset.cardId) return { kind: 'card', id: card.dataset.cardId };
  const panel = element.closest<HTMLElement>('[data-panel-id]');
  if (panel?.dataset.panelId) return { kind: 'panel', id: panel.dataset.panelId };
  return { kind: 'background' };
}

/** Where the browser keeps its own menu: text fields, links in text, and text the person has selected. */
function keepsNativeMenu(element: Element): boolean {
  if (element.closest('input, textarea, select, [contenteditable="true"], dialog, [role="menu"]'))
    return true;
  if (element.closest('a[href]') && !element.closest('[data-card-id]')) return true;
  const selection = window.getSelection();
  return Boolean(
    selection &&
    !selection.isCollapsed &&
    selection.toString().trim() !== '' &&
    !element.closest('button')
  );
}

/**
 * Replaces the browser's right click menu in the work area with one that knows what is under the
 * pointer: a card, a list or a block, a picked group, or the background. The menu key and Shift with
 * F10 open it on the focused item, a long press opens it on a touch screen, and Shift with a right
 * click still gives the browser's own menu.
 */
export function BoardContextHost({ container, context }: BoardContextHostProps) {
  const [open, setOpen] = useState<{ state: ContextMenuState; target: ContextTarget } | null>(null);
  const latest = useRef(context);
  latest.current = context;
  const viaKeyboard = useRef(false);

  useEffect(() => {
    if (!container) return undefined;
    const area = container;
    let press: { timer: number; x: number; y: number } | null = null;

    function openAt(element: Element, x: number, y: number, keyboard: boolean) {
      setOpen({
        state: {
          x,
          y,
          keyboard,
          from: document.activeElement instanceof HTMLElement ? document.activeElement : null,
        },
        target: targetOf(element),
      });
    }

    function onContextMenu(event: MouseEvent) {
      if (event.shiftKey || event.defaultPrevented || !(event.target instanceof Element)) return;
      if (keepsNativeMenu(event.target)) return;
      event.preventDefault();
      const keyboard = viaKeyboard.current;
      viaKeyboard.current = false;
      if (keyboard) {
        // The menu key has no pointer, so the menu opens beside the focused item.
        const focused =
          document.activeElement instanceof Element && area.contains(document.activeElement)
            ? document.activeElement
            : event.target;
        const box = focused.getBoundingClientRect();
        openAt(
          focused,
          box.left + Math.min(box.width, 48),
          box.top + Math.min(box.height, 24),
          true
        );
        return;
      }
      openAt(event.target, event.clientX, event.clientY, false);
    }

    function onKeyDown(event: KeyboardEvent) {
      viaKeyboard.current = event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10');
    }

    function onPointerDown(event: PointerEvent) {
      viaKeyboard.current = false;
      if (event.pointerType !== 'touch' || !(event.target instanceof Element)) return;
      const element = event.target;
      if (keepsNativeMenu(element)) return;
      press = {
        x: event.clientX,
        y: event.clientY,
        timer: window.setTimeout(() => {
          press = null;
          openAt(element, event.clientX, event.clientY, false);
        }, LONG_PRESS_MS),
      };
    }

    function cancelPress(event?: PointerEvent) {
      if (!press) return;
      if (
        event &&
        event.type === 'pointermove' &&
        Math.hypot(event.clientX - press.x, event.clientY - press.y) < LONG_PRESS_SLOP
      )
        return;
      window.clearTimeout(press.timer);
      press = null;
    }

    area.addEventListener('contextmenu', onContextMenu);
    area.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', cancelPress);
    window.addEventListener('pointerup', () => cancelPress());
    window.addEventListener('pointercancel', () => cancelPress());
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      area.removeEventListener('contextmenu', onContextMenu);
      area.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', cancelPress);
      window.removeEventListener('keydown', onKeyDown, true);
      cancelPress();
    };
  }, [container]);

  const entries = open ? boardContextEntries(open.target, latest.current) : [];

  return (
    <ContextMenu
      state={open?.state ?? null}
      label={open ? contextMenuLabel(open.target, latest.current) : 'Actions'}
      entries={entries}
      onClose={() => setOpen(null)}
    />
  );
}
