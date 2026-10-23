import { describe, expect, it } from 'vitest';

import type { BoardList, PanelKind } from './boardsApi';
import {
  GRID_COLUMNS,
  type Layout,
  clampRect,
  describeRect,
  fitLayout,
  moveTile,
  overlaps,
  resizeTile,
  resolveLayout,
  rowsUsed,
  settle,
  tabOrder,
} from './grid';

function panel(id: string, kind: PanelKind = 'list', extra: Partial<BoardList> = {}): BoardList {
  return {
    id,
    name: id,
    wip_limit: null,
    kind,
    config: kind === 'list' ? {} : { size: 'normal' },
    cards: [],
    ...extra,
  } as BoardList;
}

const cards = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `card-${index}` })) as never;

function noOverlap(layout: Layout) {
  const rects = Object.entries(layout);
  for (const [a, left] of rects) {
    for (const [b, right] of rects) {
      if (a < b) expect(overlaps(left, right), `${a} and ${b}`).toBe(false);
    }
  }
}

function insideTheGrid(layout: Layout) {
  for (const rect of Object.values(layout)) {
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.w).toBeGreaterThanOrEqual(1);
    expect(rect.x + rect.w).toBeLessThanOrEqual(GRID_COLUMNS);
  }
}

describe('settle', () => {
  it('lifts a floating tile to the top', () => {
    const layout = settle({ a: { x: 0, y: 7, w: 3, h: 4 } });

    expect(layout.a.y).toBe(0);
  });

  it('pushes a tile that lands on another below it', () => {
    const layout = settle({
      a: { x: 0, y: 0, w: 4, h: 4 },
      b: { x: 2, y: 1, w: 4, h: 4 },
    });

    expect(layout.a.y).toBe(0);
    expect(layout.b.y).toBe(4);
    noOverlap(layout);
  });

  it('leaves the pinned tile where it is and moves the others', () => {
    const layout = settle(
      {
        a: { x: 0, y: 0, w: 4, h: 4 },
        b: { x: 0, y: 4, w: 4, h: 4 },
      },
      'b'
    );

    expect(layout.b).toEqual({ x: 0, y: 4, w: 4, h: 4 });
    expect(layout.a.y).toBe(0);
  });

  it('never leaves two tiles overlapping, whatever the input', () => {
    const layout = settle({
      a: { x: 0, y: 0, w: 6, h: 6 },
      b: { x: 0, y: 0, w: 6, h: 6 },
      c: { x: 3, y: 2, w: 6, h: 6 },
      d: { x: 3, y: 2, w: 9, h: 3 },
    });

    noOverlap(layout);
    insideTheGrid(layout);
  });
});

describe('moving and resizing', () => {
  const kinds: Record<string, PanelKind> = { a: 'list', b: 'list', c: 'counter' };
  const base: Layout = {
    a: { x: 0, y: 0, w: 4, h: 6 },
    b: { x: 4, y: 0, w: 4, h: 6 },
    c: { x: 8, y: 0, w: 3, h: 4 },
  };

  it('keeps a moved tile on the grid', () => {
    const moved = moveTile(base, kinds, 'a', 99, 0);

    expect(moved.a.x + moved.a.w).toBeLessThanOrEqual(GRID_COLUMNS);
    noOverlap(moved);
  });

  it('makes room when a tile is dropped on another', () => {
    const moved = moveTile(base, kinds, 'a', 4, 0);

    expect(moved.a).toMatchObject({ x: 4, y: 0 });
    expect(moved.b.y).toBeGreaterThanOrEqual(6);
    noOverlap(moved);
  });

  it('never makes a tile smaller than its kind allows', () => {
    const resized = resizeTile(base, kinds, 'a', 1, 1);

    expect(resized.a.w).toBeGreaterThanOrEqual(2);
    expect(resized.a.h).toBeGreaterThanOrEqual(5);
  });

  it('keeps a tile inside the grid when it grows past the edge', () => {
    const resized = resizeTile(base, kinds, 'b', 12, 6);

    expect(resized.b.x + resized.b.w).toBeLessThanOrEqual(GRID_COLUMNS);
    noOverlap(resized);
  });

  it('ignores a tile it does not know', () => {
    expect(moveTile(base, kinds, 'zzz', 1, 1)).toBe(base);
    expect(resizeTile(base, kinds, 'zzz', 1, 1)).toBe(base);
  });
});

describe('clampRect', () => {
  it('rounds, bounds and enforces the smallest size', () => {
    expect(clampRect('list', { x: -3, y: -1, w: 0, h: 0 })).toEqual({ x: 0, y: 0, w: 2, h: 5 });
    expect(clampRect('note', { x: 11, y: 2.4, w: 5, h: 4 })).toEqual({ x: 7, y: 2, w: 5, h: 4 });
  });
});

describe('resolveLayout', () => {
  it('fits a board nobody has placed yet', () => {
    const layout = resolveLayout([panel('a'), panel('b'), panel('c', 'counter')]);

    expect(Object.keys(layout).sort()).toEqual(['a', 'b', 'c']);
    noOverlap(layout);
  });

  it('keeps what was placed and finds a free spot for the rest', () => {
    const layout = resolveLayout([
      panel('a', 'list', { layout: { x: 0, y: 0, w: 6, h: 8 } }),
      panel('b', 'list', { layout: { x: 6, y: 0, w: 6, h: 8 } }),
      panel('fresh', 'note'),
    ]);

    expect(layout.a).toEqual({ x: 0, y: 0, w: 6, h: 8 });
    expect(layout.b).toEqual({ x: 6, y: 0, w: 6, h: 8 });
    expect(layout.fresh.y).toBeGreaterThanOrEqual(8);
    noOverlap(layout);
  });

  it('survives a stored layout that overlaps', () => {
    noOverlap(
      resolveLayout([
        panel('a', 'list', { layout: { x: 0, y: 0, w: 6, h: 8 } }),
        panel('b', 'list', { layout: { x: 3, y: 2, w: 6, h: 8 } }),
      ])
    );
  });
});

describe('fitLayout', () => {
  it('fills the rows edge to edge', () => {
    const layout = fitLayout([
      panel('todo', 'list', { cards: cards(5) }),
      panel('doing', 'list', { cards: cards(3) }),
      panel('review', 'list'),
      panel('done', 'list', { cards: cards(9) }),
      panel('cal', 'calendar'),
      panel('agenda', 'agenda'),
    ]);

    noOverlap(layout);
    insideTheGrid(layout);
    const rows = new Map<number, number>();
    for (const rect of Object.values(layout)) {
      if (rect.h >= 5) rows.set(rect.y, (rows.get(rect.y) ?? 0) + rect.w);
    }
    for (const total of rows.values()) expect(total).toBeLessThanOrEqual(GRID_COLUMNS);
    expect(Math.max(...rows.values())).toBe(GRID_COLUMNS);
  });

  it('keeps the reading order', () => {
    const panels = ['one', 'two', 'three', 'four', 'five'].map((id) => panel(id));

    expect(tabOrder(fitLayout(panels))).toEqual(['one', 'two', 'three', 'four', 'five']);
  });

  it('follows the order the tiles have on the screen', () => {
    const current: Layout = {
      a: { x: 8, y: 0, w: 4, h: 6 },
      b: { x: 0, y: 0, w: 4, h: 6 },
      c: { x: 4, y: 0, w: 4, h: 6 },
    };

    expect(tabOrder(fitLayout([panel('a'), panel('b'), panel('c')], current))).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('does not stretch a counter across the whole board', () => {
    expect(fitLayout([panel('count', 'counter')]).count.w).toBeLessThanOrEqual(4);
  });

  it('lets the tiles below small ones rise into the room they leave', () => {
    const layout = fitLayout([
      panel('big', 'list', { cards: cards(8) }),
      panel('count', 'counter'),
      panel('count2', 'counter'),
      panel('below', 'list'),
    ]);

    noOverlap(layout);
    expect(rowsUsed(layout)).toBeLessThan(40);
  });

  it('handles an empty board and a single tile', () => {
    expect(fitLayout([])).toEqual({});
    expect(Object.keys(fitLayout([panel('only')]))).toEqual(['only']);
  });

  it('copes with the most panels a board holds', () => {
    const panels = Array.from({ length: 50 }, (_, index) =>
      panel(`p${String(index).padStart(2, '0')}`, index % 3 === 0 ? 'counter' : 'list')
    );

    const layout = fitLayout(panels);

    expect(Object.keys(layout)).toHaveLength(50);
    noOverlap(layout);
    insideTheGrid(layout);
  });
});

describe('describeRect', () => {
  it('counts cells from one', () => {
    expect(describeRect({ x: 0, y: 0, w: 4, h: 1 })).toBe(
      'column 1 of 12, row 1, 4 columns wide, 1 row tall'
    );
  });
});
