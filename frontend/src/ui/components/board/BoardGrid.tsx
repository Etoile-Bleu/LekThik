import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useBackdropGestures } from '@hooks/useBackdropGestures';
import { useMediaQuery } from '@hooks/useMediaQuery';
import { announce } from '@lib/announcer';
import { useCanvasToolStore } from '@lib/canvasToolStore';
import type { BoardList, PanelKind } from '@lib/boardsApi';
import {
  GRID_COLUMNS,
  type Layout,
  type Rect,
  describeRect,
  fitLayout,
  moveTile,
  resizeTile,
  resolveLayout,
  rowsUsed,
  sameLayout,
  tabOrder,
} from '@lib/grid';

import { FitIcon, PlusIcon, UndoIcon } from '../ui/Icons';
import './BoardGrid.css';

/** What a panel needs to take part in the free layout: a grip to move it and a way to place it exactly. */
export interface TileControls {
  gripProps: {
    'aria-label': string;
    'aria-pressed': boolean;
    'aria-describedby': string;
    'data-grip': string;
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
    onBlur: () => void;
  };
  /** Starts a move from anywhere on the header that is not a control of its own. */
  onHeaderPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPosition: () => void;
  grabbed: boolean;
}

interface BoardGridProps {
  panels: BoardList[];
  freshIds: string[];
  editable: boolean;
  renderPanel: (panel: BoardList, controls: TileControls | null) => ReactNode;
  onLayout: (layout: Layout) => void;
  onPosition: (panelId: string) => void;
  onAddBlock: () => void;
  addList: ReactNode;
}

type Gesture =
  | { id: string; kind: 'move'; startX: number; startY: number; startRect: DOMRect; base: Layout }
  | {
      id: string;
      kind: 'resize';
      startX: number;
      startY: number;
      startScroll: number;
      base: Layout;
      axis: 'both' | 'x' | 'y';
    };

interface Metrics {
  left: number;
  top: number;
  column: number;
  row: number;
}

const MOVE_THRESHOLD = 4;
const EDGE = 56;
const SCROLL_SPEED = 18;
const REDUCED = '(prefers-reduced-motion: reduce)';

function reduceMotion(): boolean {
  return document.documentElement.dataset.motion === 'reduce' || window.matchMedia(REDUCED).matches;
}

function pixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Whether a press lands on a control that has its own job. The name of a tile is the exception:
 * a press on it starts a move once the pointer travels, and still edits the name when it does not.
 */
function interactive(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('[data-drag-title]') && !target.closest('input, textarea')) return false;
  return (
    target.closest(
      'button, a, input, textarea, select, [contenteditable="true"], [role="menu"]'
    ) !== null
  );
}

/**
 * The free layout: lists and blocks are tiles on a 12 column grid that can be put anywhere and
 * made any size. Pointer, keyboard and the position form all do the same thing, and whatever is
 * dropped is saved for the whole board at once. While a tile is held, the others glide out of
 * the way and a dashed outline shows where it will land.
 */
export function BoardGrid({
  panels,
  freshIds,
  editable,
  renderPanel,
  onLayout,
  onPosition,
  onAddBlock,
  addList,
}: BoardGridProps) {
  const instructionsId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const stored = useMemo(() => resolveLayout(panels), [panels]);
  const kinds = useMemo(
    () =>
      Object.fromEntries(panels.map((panel) => [panel.id, panel.kind])) as Record<
        string,
        PanelKind
      >,
    [panels]
  );
  const names = useMemo(
    () => Object.fromEntries(panels.map((panel) => [panel.id, panel.name])),
    [panels]
  );

  const [draft, setDraft] = useState<Layout | null>(null);
  const [active, setActive] = useState<{ id: string; kind: 'move' | 'resize' } | null>(null);
  const [grabbed, setGrabbed] = useState<string | null>(null);
  const [undo, setUndo] = useState<Layout | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const draftRef = useRef<Layout | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const frame = useRef(0);
  const moved = useRef(false);
  const refocus = useRef<string | null>(null);
  const swallowClick = useRef(false);
  const keyboardBase = useRef<Layout | null>(null);

  const shown = draft ?? stored;
  draftRef.current = draft;
  // Dragging a tile needs room, so on a phone the tiles simply stack.
  const roomy = useMediaQuery('(min-width: 720px)');
  const handTool = useCanvasToolStore((state) => state.tool === 'hand' || state.spaceHeld);
  const canPoint = editable && roomy && !handTool;
  const { marquee } = useBackdropGestures(scrollRef, true);

  // ---- animation: every tile glides from where it was to where it is ----
  const rects = useRef(new Map<string, DOMRect>());
  const flipFrom = useRef<Map<string, DOMRect> | null>(null);

  const snapshot = useCallback(() => {
    const map = new Map<string, DOMRect>();
    gridRef.current?.querySelectorAll<HTMLElement>('[data-tile]').forEach((element) => {
      map.set(element.dataset.tile ?? '', element.getBoundingClientRect());
    });
    return map;
  }, []);

  const signature = useMemo(
    () =>
      Object.entries(shown)
        .map(([id, rect]) => `${id}:${rect.x},${rect.y},${rect.w},${rect.h}`)
        .join('|'),
    [shown]
  );

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const from = flipFrom.current ?? rects.current;
    flipFrom.current = null;
    const skip = reduceMotion();
    const next = new Map<string, DOMRect>();

    grid.querySelectorAll<HTMLElement>('[data-tile]').forEach((element) => {
      const id = element.dataset.tile ?? '';
      const now = element.getBoundingClientRect();
      next.set(id, now);
      const before = from.get(id);
      const held = gesture.current?.id === id && gesture.current.kind === 'move';
      if (!before || skip || held || typeof element.animate !== 'function') return;
      const dx = before.left - now.left;
      const dy = before.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      element.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
        { duration: 240, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
      );
    });
    // The held tile sits under the pointer, so it is measured again when it lands.
    if (gesture.current?.kind === 'move') {
      const held = rects.current.get(gesture.current.id);
      if (held) next.set(gesture.current.id, held);
    }
    rects.current = next;
  }, [signature]);

  // Keyboard users keep their place: a drop reorders the tiles in the DOM, so focus is put back.
  useLayoutEffect(() => {
    if (refocus.current) {
      gridRef.current
        ?.querySelector<HTMLElement>(`[data-grip="${CSS.escape(refocus.current)}"]`)
        ?.focus();
      refocus.current = null;
    }
  });

  // ---- measuring the grid ----
  const measure = useCallback((): Metrics | null => {
    const grid = gridRef.current;
    if (!grid) return null;
    const box = grid.getBoundingClientRect();
    const style = getComputedStyle(grid);
    const gap = pixels(style.columnGap);
    const rowGap = pixels(style.rowGap);
    const rowHeight = pixels(style.gridAutoRows);
    const column = (box.width - gap * (GRID_COLUMNS - 1)) / GRID_COLUMNS + gap;
    return { left: box.left, top: box.top, column, row: rowHeight + rowGap };
  }, []);

  const commit = useCallback(
    (next: Layout, base: Layout) => {
      setDraft(null);
      if (sameLayout(next, base)) return;
      setUndo(null);
      onLayout(next);
    },
    [onLayout]
  );

  // ---- pointer gestures ----
  const evaluate = useCallback(() => {
    const current = gesture.current;
    const metrics = measure();
    if (!current || !metrics) return;
    const element = gridRef.current?.querySelector<HTMLElement>(
      `[data-tile="${CSS.escape(current.id)}"]`
    );

    if (current.kind === 'move') {
      const dx = pointer.current.x - current.startX;
      const dy = pointer.current.y - current.startY;
      if (!moved.current && Math.hypot(dx, dy) < MOVE_THRESHOLD) return;
      moved.current = true;
      const left = current.startRect.left + dx - metrics.left;
      const top = current.startRect.top + dy - metrics.top;
      const x = Math.round(left / metrics.column);
      const y = Math.round(top / metrics.row);
      const base = current.base;
      const next = moveTile(base, kinds, current.id, x, y);
      const known = draftRef.current;
      if (!known || !sameLayout(known, next)) setDraft(next);

      // The tile follows the pointer exactly, whatever cell it will snap to.
      const at = next[current.id];
      if (element && at) {
        const shiftX = current.startRect.left + dx - (metrics.left + at.x * metrics.column);
        const shiftY = current.startRect.top + dy - (metrics.top + at.y * metrics.row);
        element.style.transform = `translate(${shiftX}px, ${shiftY}px)`;
      }
    } else {
      const scroller = scrollRef.current;
      const scrolled = (scroller?.scrollTop ?? 0) - current.startScroll;
      const dx = pointer.current.x - current.startX;
      const dy = pointer.current.y - current.startY + scrolled;
      const start = current.base[current.id];
      const w = current.axis === 'y' ? start.w : start.w + Math.round(dx / metrics.column);
      const h = current.axis === 'x' ? start.h : start.h + Math.round(dy / metrics.row);
      const next = resizeTile(current.base, kinds, current.id, w, h);
      const known = draftRef.current;
      if (!known || !sameLayout(known, next)) setDraft(next);
    }
  }, [kinds, measure]);

  const autoScroll = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller || !gesture.current) return;
    const box = scroller.getBoundingClientRect();
    let speed = 0;
    if (pointer.current.y < box.top + EDGE)
      speed = -SCROLL_SPEED * (1 - (pointer.current.y - box.top) / EDGE);
    else if (pointer.current.y > box.bottom - EDGE)
      speed = SCROLL_SPEED * (1 - (box.bottom - pointer.current.y) / EDGE);
    if (speed !== 0) {
      scroller.scrollTop += Math.max(-SCROLL_SPEED, Math.min(SCROLL_SPEED, speed));
      evaluate();
    }
    frame.current = requestAnimationFrame(autoScroll);
  }, [evaluate]);

  const finish = useCallback(
    (cancelled: boolean) => {
      const current = gesture.current;
      if (!current) return;
      cancelAnimationFrame(frame.current);
      const element = gridRef.current?.querySelector<HTMLElement>(
        `[data-tile="${CSS.escape(current.id)}"]`
      );
      const next = draftRef.current;
      // Measured while the tile is still under the pointer, so it glides into its cell.
      flipFrom.current = snapshot();
      if (element) element.style.transform = '';
      gesture.current = null;
      setActive(null);
      if (cancelled || !next || !moved.current) {
        setDraft(null);
        flipFrom.current = null;
      } else {
        commit(next, current.base);
        announce(`${names[current.id] ?? 'Panel'} placed, ${describeRect(next[current.id])}.`);
      }
      if (moved.current && current.kind === 'move') {
        // The press that ended a drag must not also count as a click on the name under it.
        swallowClick.current = true;
        window.setTimeout(() => {
          swallowClick.current = false;
        }, 0);
      }
      moved.current = false;
    },
    [commit, names, snapshot]
  );

  const begin = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      id: string,
      mode: Gesture['kind'],
      axis: 'both' | 'x' | 'y' = 'both'
    ) => {
      if (!canPoint || event.button !== 0 || gesture.current || grabbed) return;
      const tile = (event.currentTarget as HTMLElement).closest<HTMLElement>('[data-tile]');
      if (!tile) return;
      if (mode === 'resize') {
        event.preventDefault();
        (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
      }
      pointer.current = { x: event.clientX, y: event.clientY };
      moved.current = mode === 'resize';
      const base = stored;
      if (mode === 'move') {
        gesture.current = {
          id,
          kind: 'move',
          startX: event.clientX,
          startY: event.clientY,
          startRect: tile.getBoundingClientRect(),
          base,
        };
      } else {
        gesture.current = {
          id,
          kind: 'resize',
          startX: event.clientX,
          startY: event.clientY,
          startScroll: scrollRef.current?.scrollTop ?? 0,
          base,
          axis,
        };
      }
      setActive({ id, kind: mode });
      frame.current = requestAnimationFrame(autoScroll);
    },
    [autoScroll, canPoint, grabbed, stored]
  );

  useEffect(() => {
    function handleMove(event: PointerEvent) {
      if (!gesture.current) return;
      pointer.current = { x: event.clientX, y: event.clientY };
      evaluate();
    }
    function handleUp() {
      finish(false);
    }
    function handleCancel() {
      finish(true);
    }
    // Dragging across the page must not select text on the way.
    const keepSelection = (event: Event) => {
      if (gesture.current) event.preventDefault();
    };
    const stopClick = (event: Event) => {
      if (swallowClick.current) {
        event.stopPropagation();
        event.preventDefault();
      }
    };
    document.addEventListener('selectstart', keepSelection);
    window.addEventListener('click', stopClick, true);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    return () => {
      document.removeEventListener('selectstart', keepSelection);
      window.removeEventListener('click', stopClick, true);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
      cancelAnimationFrame(frame.current);
    };
  }, [evaluate, finish]);

  // ---- keyboard: pick up, arrows to move, shift and arrows to resize, enter to drop ----
  function dropKeyboard(cancelled: boolean) {
    const id = grabbed;
    const base = keyboardBase.current;
    const next = draftRef.current;
    setGrabbed(null);
    keyboardBase.current = null;
    if (!id || !base) return;
    refocus.current = id;
    if (cancelled || !next) {
      setDraft(null);
      announce(`${names[id] ?? 'Panel'} dropped, nothing changed.`);
      return;
    }
    flipFrom.current = snapshot();
    commit(next, base);
    announce(`${names[id] ?? 'Panel'} dropped, ${describeRect(next[id])}.`);
  }

  function handleGripKey(id: string, event: ReactKeyboardEvent<HTMLElement>) {
    if (!canPoint) return;
    const holding = grabbed === id;
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (holding) {
        dropKeyboard(false);
      } else if (!grabbed) {
        keyboardBase.current = stored;
        setGrabbed(id);
        setDraft(stored);
        announce(
          `Picked up ${names[id] ?? 'panel'}, ${describeRect(stored[id])}. Arrow keys move it, shift and arrow keys resize it, enter drops it, escape cancels.`
        );
      }
      return;
    }
    if (!holding) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dropKeyboard(true);
      return;
    }
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const delta = step[event.key];
    if (!delta) return;
    event.preventDefault();
    const current = draftRef.current ?? stored;
    const rect = current[id];
    const next = event.shiftKey
      ? resizeTile(current, kinds, id, rect.w + delta[0], rect.h + delta[1])
      : moveTile(current, kinds, id, rect.x + delta[0], rect.y + delta[1]);
    setDraft(next);
    announce(`${event.shiftKey ? 'Resized' : 'Moved'}, ${describeRect(next[id])}.`);
  }

  // ---- fit ----
  function fit() {
    const next = fitLayout(panels, stored);
    if (sameLayout(next, stored)) {
      announce('The layout already fits.');
      return;
    }
    flipFrom.current = snapshot();
    setUndo(stored);
    onLayout(next);
    announce('Panels arranged to fit the board.');
  }

  function undoFit() {
    if (!undo) return;
    flipFrom.current = snapshot();
    const previous = undo;
    setUndo(null);
    onLayout(previous);
    announce('Previous layout restored.');
  }

  const order = useMemo(() => tabOrder(stored), [stored]);
  const byId = useMemo(() => new Map(panels.map((panel) => [panel.id, panel])), [panels]);
  const rows = Math.max(rowsUsed(shown) + (canPoint ? 4 : 0), 8);
  const ghost = active?.kind === 'move' && draft ? draft[active.id] : null;
  const keyboardGhost = grabbed && draft ? draft[grabbed] : null;
  const dashed = ghost ?? keyboardGhost;

  function controlsFor(panel: BoardList): TileControls | null {
    if (!canPoint) return null;
    return {
      gripProps: {
        'aria-label': `Move or resize ${panel.name}`,
        'aria-pressed': grabbed === panel.id,
        'aria-describedby': instructionsId,
        'data-grip': panel.id,
        onKeyDown: (event) => handleGripKey(panel.id, event),
        onBlur: () => {
          if (grabbed === panel.id) dropKeyboard(true);
        },
      },
      onHeaderPointerDown: (event) => {
        if (interactive(event.target)) return;
        begin(event, panel.id, 'move');
      },
      onPosition: () => onPosition(panel.id),
      grabbed: grabbed === panel.id,
    };
  }

  const gridStyle = { '--canvas-rows': rows } as CSSProperties;

  return (
    <div className="canvas">
      <div className="canvas__toolbar" role="toolbar" aria-label="Layout">
        {editable && (
          <>
            {addList}
            <button type="button" className="btn btn--outline btn--sm" onClick={onAddBlock}>
              <PlusIcon size={16} /> Add a block
            </button>
            <span className="canvas__spacer" />
            {undo && (
              <button
                type="button"
                className="btn btn--ghost btn--sm canvas__undo"
                onClick={undoFit}
              >
                <UndoIcon size={16} /> Undo fit
              </button>
            )}
            <button
              type="button"
              className="btn btn--outline btn--sm canvas__fit"
              onClick={fit}
              disabled={panels.length === 0}
            >
              <FitIcon size={16} /> Fit
            </button>
          </>
        )}
      </div>

      <p id={instructionsId} className="sr-only">
        Press enter or space to pick this up. Arrow keys move it, shift with arrow keys resizes it,
        enter drops it and escape cancels. The position and size form in the menu does the same
        without dragging.
      </p>

      <div className="canvas__scroll" ref={scrollRef} data-tool={handTool ? 'hand' : 'select'}>
        {panels.length === 0 ? (
          <p className="canvas__empty">
            {editable ? 'Add a list or a block to start your layout.' : 'This board is empty.'}
          </p>
        ) : (
          <div
            className="canvas__grid"
            ref={gridRef}
            style={gridStyle}
            data-editable={canPoint || undefined}
            data-holding={active?.kind ?? (grabbed ? 'move' : undefined)}
          >
            {dashed && (
              <div
                className="canvas__ghost"
                data-tile="ghost"
                aria-hidden="true"
                style={
                  {
                    '--x': dashed.x,
                    '--y': dashed.y,
                    '--w': dashed.w,
                    '--h': dashed.h,
                  } as CSSProperties
                }
              />
            )}
            {order.map((id) => {
              const panel = byId.get(id);
              const rect: Rect | undefined = shown[id];
              if (!panel || !rect) return null;
              const holding = active?.id === id || grabbed === id;
              return (
                <div
                  key={id}
                  className="canvas__tile"
                  data-tile={id}
                  data-kind={panel.kind}
                  data-holding={holding ? (active?.kind ?? 'move') : undefined}
                  data-fresh={freshIds.includes(id) || undefined}
                  style={
                    { '--x': rect.x, '--y': rect.y, '--w': rect.w, '--h': rect.h } as CSSProperties
                  }
                >
                  {renderPanel(panel, controlsFor(panel))}
                  {canPoint && (
                    <>
                      <span
                        className="canvas__handle canvas__handle--e"
                        aria-hidden="true"
                        onPointerDown={(event) => begin(event, id, 'resize', 'x')}
                      />
                      <span
                        className="canvas__handle canvas__handle--s"
                        aria-hidden="true"
                        onPointerDown={(event) => begin(event, id, 'resize', 'y')}
                      />
                      <span
                        className="canvas__handle canvas__handle--se"
                        aria-hidden="true"
                        onPointerDown={(event) => begin(event, id, 'resize', 'both')}
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {marquee && (
          <div
            className="marquee"
            aria-hidden="true"
            style={{
              left: marquee.left,
              top: marquee.top,
              width: marquee.width,
              height: marquee.height,
            }}
          />
        )}
      </div>
    </div>
  );
}
