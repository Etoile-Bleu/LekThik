import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAnnouncer } from '@lib/announcer';
import type { BoardList } from '@lib/boardsApi';
import { type Layout, overlaps } from '@lib/grid';

import { BoardGrid, type TileControls } from './BoardGrid';

function panel(id: string, kind: BoardList['kind'], layout: BoardList['layout'] = null): BoardList {
  return {
    id,
    name: id,
    wip_limit: null,
    kind,
    config: kind === 'list' ? {} : { size: 'normal' },
    cards: [],
    layout,
  } as BoardList;
}

const PANELS = [
  panel('Todo', 'list', { x: 0, y: 0, w: 4, h: 8 }),
  panel('Doing', 'list', { x: 4, y: 0, w: 4, h: 8 }),
  panel('Count', 'counter', { x: 8, y: 0, w: 3, h: 4 }),
];

function Tile({ panel: item, controls }: { panel: BoardList; controls: TileControls | null }) {
  return (
    <section aria-label={item.name} onPointerDown={controls?.onHeaderPointerDown}>
      {controls && (
        <button type="button" {...controls.gripProps}>
          grip
        </button>
      )}
      {controls && (
        <button type="button" onClick={controls.onPosition}>
          place {item.name}
        </button>
      )}
      {item.name}
    </section>
  );
}

function renderGrid(props: Partial<React.ComponentProps<typeof BoardGrid>> = {}) {
  const onLayout = vi.fn();
  const onPosition = vi.fn();
  const onAddBlock = vi.fn();
  const view = render(
    <BoardGrid
      panels={PANELS}
      freshIds={[]}
      editable
      renderPanel={(item, controls) => <Tile panel={item} controls={controls} />}
      onLayout={onLayout}
      onPosition={onPosition}
      onAddBlock={onAddBlock}
      addList={<button type="button">Add a list</button>}
      {...props}
    />
  );
  return { ...view, onLayout, onPosition, onAddBlock };
}

function tileOf(name: string): HTMLElement {
  const element = screen.getByLabelText(name).closest<HTMLElement>('[data-tile]');
  if (!element) throw new Error(`no tile for ${name}`);
  return element;
}

function gripOf(name: string): HTMLElement {
  return tileOf(name).querySelector<HTMLElement>('[data-grip]') as HTMLElement;
}

function noOverlap(layout: Layout) {
  const entries = Object.entries(layout);
  for (const [a, left] of entries) {
    for (const [b, right] of entries) {
      if (a < b) expect(overlaps(left, right), `${a} and ${b}`).toBe(false);
    }
  }
}

describe('BoardGrid', () => {
  const original = window.matchMedia;

  beforeEach(() => {
    // Dragging needs room, so the grid only lets tiles be placed on a screen wide enough.
    window.matchMedia = ((query: string) =>
      ({
        matches: query.includes('min-width: 720px'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList) as typeof window.matchMedia;
    useAnnouncer.setState({ message: '', tick: 0 });
  });

  afterEach(() => {
    window.matchMedia = original;
  });

  it('puts every tile on the cell it was given', () => {
    renderGrid();

    expect(tileOf('Todo').style.cssText).toContain('--x: 0');
    expect(tileOf('Doing').style.cssText).toContain('--x: 4');
    expect(tileOf('Count').style.cssText).toContain('--w: 3');
  });

  it('shows what to do on an empty board', () => {
    renderGrid({ panels: [] });

    expect(screen.getByText('Add a list or a block to start your layout.')).toBeInTheDocument();
  });

  it('lets a tile be picked up, moved by the arrow keys and dropped, then saves it', () => {
    const { onLayout } = renderGrid();
    const grip = gripOf('Doing');
    grip.focus();

    fireEvent.keyDown(grip, { key: ' ' });
    expect(grip).toHaveAttribute('aria-pressed', 'true');
    expect(useAnnouncer.getState().message).toContain('Picked up Doing');

    fireEvent.keyDown(grip, { key: 'ArrowRight' });
    fireEvent.keyDown(grip, { key: 'ArrowRight' });
    expect(useAnnouncer.getState().message).toContain('column 7 of 12');
    expect(onLayout).not.toHaveBeenCalled();

    fireEvent.keyDown(grip, { key: 'Enter' });

    expect(onLayout).toHaveBeenCalledTimes(1);
    const saved = onLayout.mock.calls[0][0] as Layout;
    expect(saved.Doing.x).toBeGreaterThanOrEqual(6);
    noOverlap(saved);
    expect(grip).toHaveAttribute('aria-pressed', 'false');
    expect(useAnnouncer.getState().message).toContain('Doing dropped');
  });

  it('resizes with shift and the arrow keys', () => {
    const { onLayout } = renderGrid();
    const grip = gripOf('Todo');
    grip.focus();

    fireEvent.keyDown(grip, { key: 'Enter' });
    fireEvent.keyDown(grip, { key: 'ArrowDown', shiftKey: true });
    fireEvent.keyDown(grip, { key: 'ArrowDown', shiftKey: true });
    fireEvent.keyDown(grip, { key: 'Enter' });

    const saved = onLayout.mock.calls[0][0] as Layout;
    expect(saved.Todo.h).toBe(10);
    expect(saved.Todo.w).toBe(4);
  });

  it('cancels with escape and changes nothing', () => {
    const { onLayout } = renderGrid();
    const grip = gripOf('Doing');
    grip.focus();

    fireEvent.keyDown(grip, { key: ' ' });
    fireEvent.keyDown(grip, { key: 'ArrowDown' });
    fireEvent.keyDown(grip, { key: 'Escape' });

    expect(onLayout).not.toHaveBeenCalled();
    expect(useAnnouncer.getState().message).toContain('nothing changed');
    expect(tileOf('Doing').style.cssText).toContain('--y: 0');
  });

  it('cancels when focus leaves a tile that is held', () => {
    const { onLayout } = renderGrid();
    const grip = gripOf('Doing');
    grip.focus();

    fireEvent.keyDown(grip, { key: ' ' });
    fireEvent.keyDown(grip, { key: 'ArrowRight' });
    fireEvent.blur(grip);

    expect(onLayout).not.toHaveBeenCalled();
    expect(grip).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not let two tiles be held at once', () => {
    renderGrid();
    const first = gripOf('Todo');
    const second = gripOf('Doing');

    fireEvent.keyDown(first, { key: ' ' });
    fireEvent.keyDown(second, { key: ' ' });

    expect(first).toHaveAttribute('aria-pressed', 'true');
    expect(second).toHaveAttribute('aria-pressed', 'false');
  });

  it('points the grip at the instructions, which are read to screen readers', () => {
    renderGrid();

    const described = gripOf('Todo').getAttribute('aria-describedby') ?? '';

    expect(document.getElementById(described)?.textContent).toContain('Arrow keys move it');
  });

  it('fits the board, saves a layout without overlaps and can undo it', () => {
    const { onLayout } = renderGrid();

    fireEvent.click(screen.getByRole('button', { name: /^Fit$/ }));

    expect(onLayout).toHaveBeenCalledTimes(1);
    noOverlap(onLayout.mock.calls[0][0] as Layout);
    expect(useAnnouncer.getState().message).toContain('arranged');

    fireEvent.click(screen.getByRole('button', { name: /Undo fit/ }));

    expect(onLayout).toHaveBeenCalledTimes(2);
    expect((onLayout.mock.calls[1][0] as Layout).Doing).toEqual({ x: 4, y: 0, w: 4, h: 8 });
    expect(screen.queryByRole('button', { name: /Undo fit/ })).toBeNull();
  });

  it('says so when the layout already fits', () => {
    const { onLayout } = renderGrid({
      panels: [panel('Only', 'list')].map((item) => ({ ...item, layout: null })),
    });

    fireEvent.click(screen.getByRole('button', { name: /^Fit$/ }));
    expect(onLayout).toHaveBeenCalledTimes(0);
    expect(useAnnouncer.getState().message).toContain('already fits');
  });

  it('opens the form for exact numbers from a tile', () => {
    const { onPosition } = renderGrid();

    fireEvent.click(screen.getByRole('button', { name: 'place Doing' }));

    expect(onPosition).toHaveBeenCalledWith('Doing');
  });

  it('adds blocks from its toolbar', () => {
    const { onAddBlock } = renderGrid();

    fireEvent.click(screen.getByRole('button', { name: /Add a block/ }));

    expect(onAddBlock).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add a list' })).toBeInTheDocument();
  });

  it('is read only for someone who can only look', () => {
    renderGrid({ editable: false });

    expect(screen.queryByRole('button', { name: /^Fit$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'grip' })).toBeNull();
    expect(document.querySelector('.canvas__handle')).toBeNull();
  });

  it('shows no handles and no grips when the screen is too narrow to drag on', () => {
    window.matchMedia = ((query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList) as typeof window.matchMedia;

    renderGrid();

    expect(document.querySelector('.canvas__handle')).toBeNull();
    expect(screen.queryByRole('button', { name: 'grip' })).toBeNull();
  });

  it('leaves the tiles alone when a press on a control ends without dragging', () => {
    const { onLayout } = renderGrid();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'place Todo' }), {
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    act(() => {
      window.dispatchEvent(new Event('pointerup'));
    });

    expect(onLayout).not.toHaveBeenCalled();
  });
});
