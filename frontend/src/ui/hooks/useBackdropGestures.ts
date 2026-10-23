import { type RefObject, useEffect, useRef, useState } from 'react';

import { announce } from '@lib/announcer';
import { describeSelection, useSelectionStore } from '@lib/selectionStore';
import { panning } from '@lib/canvasToolStore';

/** A rectangle in the coordinates of the scrolling area, so it moves with the content. */
export interface MarqueeRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const THRESHOLD = 4;
const EDGE = 48;
const SCROLL_SPEED = 16;

function interactive(target: Element): boolean {
  return (
    target.closest(
      'button, a, input, textarea, select, label, [contenteditable="true"], [role="menu"]'
    ) !== null
  );
}

type Mode = 'pan' | 'panels' | 'cards';

interface Press {
  mode: Mode;
  pointerId: number;
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
  additive: boolean;
  baseCards: string[];
  basePanels: string[];
  moved: boolean;
}

/**
 * What a press on the background of a board does. With the select tool it draws a rectangle that
 * picks what it touches, like on a desktop: lists and blocks when it starts on the background,
 * cards when it starts in the empty part of a list. With the hand tool, with Space held, or with the
 * middle button, it moves the view itself, in every direction. A plain click on the background
 * puts the selection down.
 */
export function useBackdropGestures(
  scrollerRef: RefObject<HTMLElement>,
  enabled: boolean
): { marquee: MarqueeRect | null } {
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const press = useRef<Press | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const frame = useRef(0);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !enabled) return undefined;
    const area = scroller;

    function hits(current: Press): { cards: string[]; panels: string[] } {
      const box = area.getBoundingClientRect();
      const x1 = Math.min(current.startX, pointer.current.x);
      const y1 = Math.min(current.startY, pointer.current.y);
      const x2 = Math.max(current.startX, pointer.current.x);
      const y2 = Math.max(current.startY, pointer.current.y);
      const touches = (rect: DOMRect) =>
        rect.left < x2 && rect.right > x1 && rect.top < y2 && rect.bottom > y1;
      void box;

      if (current.mode === 'panels') {
        const panels = Array.from(area.querySelectorAll<HTMLElement>('[data-panel-id]'))
          .filter((element) => touches(element.getBoundingClientRect()))
          .map((element) => element.dataset.panelId ?? '');
        return {
          cards: current.additive ? current.baseCards : [],
          panels: merge(current, panels, 'panels'),
        };
      }
      const cards = Array.from(area.querySelectorAll<HTMLElement>('[data-card-id]'))
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          // A card scrolled out of its list is not under the rectangle even if its box is.
          const holder = element.closest('.board-list__cards')?.getBoundingClientRect();
          const visible = !holder || (rect.bottom > holder.top && rect.top < holder.bottom);
          return visible && touches(rect);
        })
        .map((element) => element.dataset.cardId ?? '');
      return {
        cards: merge(current, cards, 'cards'),
        panels: current.additive ? current.basePanels : [],
      };
    }

    function merge(current: Press, found: string[], kind: 'cards' | 'panels'): string[] {
      const base = kind === 'cards' ? current.baseCards : current.basePanels;
      return current.additive ? Array.from(new Set([...base, ...found])) : found;
    }

    function rectOf(current: Press): MarqueeRect {
      const box = area.getBoundingClientRect();
      const x1 = Math.min(current.startX, pointer.current.x);
      const y1 = Math.min(current.startY, pointer.current.y);
      const x2 = Math.max(current.startX, pointer.current.x);
      const y2 = Math.max(current.startY, pointer.current.y);
      return {
        left: x1 - box.left + area.scrollLeft,
        top: y1 - box.top + area.scrollTop,
        width: x2 - x1,
        height: y2 - y1,
      };
    }

    function update() {
      const current = press.current;
      if (!current) return;
      if (current.mode === 'pan') {
        area.scrollLeft = current.scrollLeft - (pointer.current.x - current.startX);
        area.scrollTop = current.scrollTop - (pointer.current.y - current.startY);
        return;
      }
      if (!current.moved) {
        if (
          Math.hypot(pointer.current.x - current.startX, pointer.current.y - current.startY) <
          THRESHOLD
        ) {
          return;
        }
        current.moved = true;
      }
      // The rectangle is anchored to the content, so scrolling while it is drawn stretches it.
      const found = hits({
        ...current,
        startX: current.startX - (area.scrollLeft - current.scrollLeft),
        startY: current.startY - (area.scrollTop - current.scrollTop),
      });
      useSelectionStore.getState().setSelection(found.cards, found.panels, false);
      setMarquee(
        rectOf({
          ...current,
          startX: current.startX - (area.scrollLeft - current.scrollLeft),
          startY: current.startY - (area.scrollTop - current.scrollTop),
        })
      );
    }

    function loop() {
      const current = press.current;
      if (!current) return;
      if (current.mode !== 'pan' && current.moved) {
        const box = area.getBoundingClientRect();
        let dy = 0;
        let dx = 0;
        if (pointer.current.y < box.top + EDGE) dy = -SCROLL_SPEED;
        else if (pointer.current.y > box.bottom - EDGE) dy = SCROLL_SPEED;
        if (pointer.current.x < box.left + EDGE) dx = -SCROLL_SPEED;
        else if (pointer.current.x > box.right - EDGE) dx = SCROLL_SPEED;
        if (dx !== 0 || dy !== 0) {
          area.scrollLeft += dx;
          area.scrollTop += dy;
          update();
        }
      }
      frame.current = requestAnimationFrame(loop);
    }

    function finish() {
      const current = press.current;
      if (!current) return;
      press.current = null;
      cancelAnimationFrame(frame.current);
      area.removeAttribute('data-panning');
      area.removeAttribute('data-selecting');
      setMarquee(null);
      if (current.mode === 'pan') return;
      const state = useSelectionStore.getState();
      if (!current.moved) {
        // A click on the background, not a drag, puts the selection down.
        if (!current.additive) state.clear();
      } else {
        announce(`${describeSelection(state.cards.length, state.panels.length)}.`);
      }
    }

    function start(event: PointerEvent, mode: Mode) {
      press.current = {
        mode,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: area.scrollLeft,
        scrollTop: area.scrollTop,
        additive: event.shiftKey || event.ctrlKey || event.metaKey,
        baseCards: useSelectionStore.getState().cards,
        basePanels: useSelectionStore.getState().panels,
        moved: false,
      };
      pointer.current = { x: event.clientX, y: event.clientY };
      if (mode === 'pan') {
        area.setAttribute('data-panning', '');
      } else {
        // Drawing a rectangle must never start selecting the text under it.
        area.setAttribute('data-selecting', '');
        window.getSelection()?.removeAllRanges();
      }
      frame.current = requestAnimationFrame(loop);
    }

    function onPointerDown(event: PointerEvent) {
      if (press.current || !(event.target instanceof Element)) return;
      const target = event.target;
      const middle = event.button === 1;
      if (event.button !== 0 && !middle) return;

      if (middle || panning()) {
        // Moving the view works from anywhere, even on a card, and nothing else may react to it.
        if (!middle && target.closest('[role="menu"], dialog')) return;
        event.preventDefault();
        event.stopPropagation();
        start(event, 'pan');
        return;
      }
      if (interactive(target) || target.closest('[data-card-id]')) return;
      const insideList = target.closest('.board-list, .board-block, [data-tile]') !== null;
      if (insideList && !target.closest('.board-list__cards')) return;
      start(event, insideList ? 'cards' : 'panels');
    }

    // The mouse events that follow a press would still wake the drag and drop, so they stop too.
    function blockMouse(event: MouseEvent) {
      if ((event.button === 1 || panning()) && event.button <= 1) {
        const target = event.target;
        if (target instanceof Element && target.closest('[role="menu"], dialog')) return;
        event.preventDefault();
        event.stopPropagation();
      }
    }

    function onMove(event: PointerEvent) {
      if (!press.current) return;
      pointer.current = { x: event.clientX, y: event.clientY };
      update();
    }

    function onAuxClick(event: MouseEvent) {
      if (event.button === 1) event.preventDefault();
    }

    function keepTextAlone(event: Event) {
      if (press.current) event.preventDefault();
    }

    document.addEventListener('selectstart', keepTextAlone);
    area.addEventListener('pointerdown', onPointerDown);
    area.addEventListener('mousedown', blockMouse);
    area.addEventListener('auxclick', onAuxClick);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      document.removeEventListener('selectstart', keepTextAlone);
      area.removeEventListener('pointerdown', onPointerDown);
      area.removeEventListener('mousedown', blockMouse);
      area.removeEventListener('auxclick', onAuxClick);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      cancelAnimationFrame(frame.current);
      press.current = null;
    };
  }, [scrollerRef, enabled]);

  return { marquee };
}
