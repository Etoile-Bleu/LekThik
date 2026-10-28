import type { BoardList, PanelKind } from './boardsApi';

/** The free layout is a grid this many cells wide. Rows have no end. */
export const GRID_COLUMNS = 12;
export const GRID_MAX_TILE_HEIGHT = 100;
export const GRID_MAX_ROWS = 400;

/** Where a tile sits and how big it is, in cells counted from the top left corner. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One rectangle per panel id. */
export type Layout = Record<string, Rect>;

interface Size {
  w: number;
  h: number;
}

/** The smallest a tile of each kind can be before its content stops being readable. */
const MIN_SIZE: Record<PanelKind, Size> = {
  list: { w: 2, h: 5 },
  calendar: { w: 3, h: 7 },
  agenda: { w: 2, h: 5 },
  note: { w: 2, h: 3 },
  counter: { w: 2, h: 3 },
  image: { w: 2, h: 3 },
  embed: { w: 3, h: 5 },
  link: { w: 2, h: 3 },
  progress: { w: 2, h: 4 },
  overdue: { w: 2, h: 4 },
  chart: { w: 3, h: 5 },
  snippet: { w: 3, h: 4 },
  table: { w: 3, h: 4 },
  clocks: { w: 3, h: 5 },
};

/** The widest a tile of each kind gets when Fit stretches a row to fill the board. */
const MAX_FIT_WIDTH: Partial<Record<PanelKind, number>> = {
  counter: 4,
  link: 6,
};

export function minSize(kind: PanelKind): Size {
  return MIN_SIZE[kind];
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function wide(panel: BoardList): boolean {
  return (panel.config as { size?: string }).size === 'wide';
}

/** What a panel would like to be, from what it holds. Fit starts from this. */
export function idealSize(panel: BoardList): Size {
  const text = (panel.config as { text?: string }).text ?? '';
  switch (panel.kind) {
    case 'list':
      return { w: 3, h: clamp(4 + Math.ceil(panel.cards.length * 1.3), 6, 16) };
    case 'calendar':
      return wide(panel) ? { w: 6, h: 10 } : { w: 4, h: 10 };
    case 'agenda':
      return { w: wide(panel) ? 4 : 3, h: 9 };
    case 'note':
      return { w: wide(panel) ? 6 : 4, h: clamp(3 + Math.ceil(text.length / 70), 4, 12) };
    case 'counter':
      return { w: 3, h: 4 };
    case 'image':
      return wide(panel) ? { w: 6, h: 9 } : { w: 4, h: 7 };
    case 'embed':
      return wide(panel) ? { w: 6, h: 9 } : { w: 4, h: 8 };
    case 'link':
      return { w: 3, h: 3 };
    case 'progress':
      return (panel.config as { style?: string }).style === 'bar' ? { w: 3, h: 3 } : { w: 3, h: 5 };
    case 'overdue':
      return { w: wide(panel) ? 4 : 3, h: 8 };
    case 'chart':
      return { w: wide(panel) ? 6 : 4, h: 7 };
    case 'clocks': {
      const config = panel.config as { zones?: string[]; place?: unknown };
      const zones = config.zones?.length ?? 0;
      return {
        w: wide(panel) ? 5 : 4,
        h: clamp(4 + zones * 2 + (config.place ? 3 : 0), 5, 16),
      };
    }
    case 'table': {
      const rows = (panel.config as { rows?: string[][] }).rows ?? [];
      const columns = rows.reduce((most, row) => Math.max(most, row.length), 0);
      return {
        w: clamp(2 + columns, wide(panel) ? 6 : 4, 12),
        h: clamp(4 + Math.ceil(rows.length * 1.1), 5, 14),
      };
    }
    case 'snippet': {
      const code = (panel.config as { code?: string }).code ?? '';
      const lines = code === '' ? 3 : code.split('\n').length;
      return { w: wide(panel) ? 6 : 4, h: clamp(3 + Math.ceil(lines * 0.9), 4, 14) };
    }
  }
}

/** Keeps a rectangle on the grid and at least as big as its kind allows. */
export function clampRect(kind: PanelKind, rect: Rect): Rect {
  const min = MIN_SIZE[kind];
  const w = clamp(Math.round(rect.w), min.w, GRID_COLUMNS);
  const h = clamp(Math.round(rect.h), min.h, GRID_MAX_TILE_HEIGHT);
  const x = clamp(Math.round(rect.x), 0, GRID_COLUMNS - w);
  const y = clamp(Math.round(rect.y), 0, GRID_MAX_ROWS - h);
  return { x, y, w, h };
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function byPosition(layout: Layout) {
  return (a: string, b: string) =>
    layout[a].y - layout[b].y || layout[a].x - layout[b].x || a.localeCompare(b);
}

/**
 * Lets gravity act: every tile rises as far as the tiles above it allow, and a tile that
 * lands on another is pushed below it. The pinned tile, the one being moved or resized,
 * stays exactly where it is and the others make room around it. Nothing floats, and
 * nothing overlaps, whatever the input.
 */
export function settle(layout: Layout, pinned?: string): Layout {
  const ids = Object.keys(layout).sort(byPosition(layout));
  const placed: Rect[] = [];
  const next: Layout = {};

  const place = (id: string, fixed: boolean) => {
    const rect = { ...layout[id] };
    if (!fixed) {
      while (rect.y > 0 && !placed.some((other) => overlaps({ ...rect, y: rect.y - 1 }, other))) {
        rect.y -= 1;
      }
      while (placed.some((other) => overlaps(rect, other))) {
        rect.y += 1;
      }
    }
    placed.push(rect);
    next[id] = rect;
  };

  if (pinned !== undefined && layout[pinned]) place(pinned, true);
  for (const id of ids) {
    if (id !== pinned) place(id, false);
  }
  return next;
}

/** Puts a tile with its top left corner at a cell. The others move out of its way. */
export function moveTile(
  layout: Layout,
  kinds: Record<string, PanelKind>,
  id: string,
  x: number,
  y: number
): Layout {
  const current = layout[id];
  if (!current) return layout;
  const rect = clampRect(kinds[id] ?? 'list', { ...current, x, y });
  return settle({ ...layout, [id]: rect }, id);
}

/** Gives a tile a new size, keeping its top left corner. The others move out of its way. */
export function resizeTile(
  layout: Layout,
  kinds: Record<string, PanelKind>,
  id: string,
  w: number,
  h: number
): Layout {
  const current = layout[id];
  if (!current) return layout;
  const rect = clampRect(kinds[id] ?? 'list', { ...current, w, h });
  return settle({ ...layout, [id]: rect }, id);
}

/** How many rows the layout uses, counting from the top. */
export function rowsUsed(layout: Layout): number {
  return Object.values(layout).reduce((bottom, rect) => Math.max(bottom, rect.y + rect.h), 0);
}

/** The first free spot, scanning left to right then downwards, where a tile of this size fits. */
export function firstFree(layout: Layout, size: Size): Rect {
  for (let y = 0; y <= GRID_MAX_ROWS - size.h; y++) {
    for (let x = 0; x <= GRID_COLUMNS - size.w; x++) {
      const candidate = { x, y, w: size.w, h: size.h };
      if (!Object.values(layout).some((other) => overlaps(candidate, other))) return candidate;
    }
  }
  return { x: 0, y: rowsUsed(layout), w: size.w, h: size.h };
}

/** Tiles, in the order a person reads them: top to bottom, left to right. */
export function readingOrder(panels: BoardList[], layout?: Layout): BoardList[] {
  if (!layout) return [...panels];
  const index = new Map(panels.map((panel, position) => [panel.id, position]));
  return [...panels].sort((a, b) => {
    const left = layout[a.id];
    const right = layout[b.id];
    if (left && right) return left.y - right.y || left.x - right.x;
    if (left) return -1;
    if (right) return 1;
    return (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0);
  });
}

/**
 * The layout a board shows. Panels somebody placed stay where they were put. Panels that were
 * never placed, a new block for instance, take the first free spot of their ideal size. When
 * nothing was ever placed the board is simply fitted.
 */
export function resolveLayout(panels: BoardList[]): Layout {
  const placed = panels.filter((panel) => panel.layout);
  if (placed.length === 0) return fitLayout(panels);

  const layout: Layout = {};
  for (const panel of placed) {
    if (panel.layout) layout[panel.id] = clampRect(panel.kind, panel.layout);
  }
  const settled = settle(layout);
  const result = { ...settled };
  for (const panel of panels) {
    if (result[panel.id]) continue;
    const size = clampRect(panel.kind, { x: 0, y: 0, ...idealSize(panel) });
    result[panel.id] = firstFree(result, size);
  }
  return result;
}

interface Slot {
  id: string;
  kind: PanelKind;
  ideal: Size;
}

/** Splits the tiles, in order, into rows of at most 12 columns that leave the fewest gaps. */
function partitionRows(slots: Slot[]): Slot[][] {
  const count = slots.length;
  const cost = new Array<number>(count + 1).fill(Number.POSITIVE_INFINITY);
  const from = new Array<number>(count + 1).fill(0);
  cost[0] = 0;

  for (let end = 1; end <= count; end++) {
    let width = 0;
    for (let start = end - 1; start >= 0; start--) {
      width += slots[start].ideal.w;
      if (width > GRID_COLUMNS) break;
      const gap = GRID_COLUMNS - width;
      // A gap is stretched away, so it costs less than a row would, but a lot of gap looks stretched.
      const candidate = cost[start] + gap * gap + 3;
      if (candidate < cost[end]) {
        cost[end] = candidate;
        from[end] = start;
      }
    }
  }

  const rows: Slot[][] = [];
  for (let end = count; end > 0; end = from[end]) {
    rows.unshift(slots.slice(from[end], end));
  }
  return rows;
}

/** Spreads the spare columns of a row over its tiles, the roomiest first. */
function stretch(row: Slot[]): number[] {
  const widths = row.map((slot) => slot.ideal.w);
  let spare = GRID_COLUMNS - widths.reduce((sum, width) => sum + width, 0);
  const roomy = (slot: Slot) => (slot.kind === 'list' || slot.kind === 'calendar' ? 0 : 1);
  const order = row.map((_, index) => index).sort((a, b) => roomy(row[a]) - roomy(row[b]) || a - b);

  while (spare > 0) {
    let grew = false;
    for (const index of order) {
      if (spare === 0) break;
      const cap = MAX_FIT_WIDTH[row[index].kind] ?? GRID_COLUMNS;
      if (widths[index] < cap) {
        widths[index] += 1;
        spare -= 1;
        grew = true;
      }
    }
    if (!grew) break;
  }
  return widths;
}

/**
 * The most readable arrangement of every panel: the reading order is kept, tiles take the size
 * their content asks for, rows are filled edge to edge with as few gaps as possible, and the
 * tiles of a row share a height so the edges line up. Small tiles such as counters keep their
 * own height and the tiles below rise into the room they leave.
 */
export function fitLayout(panels: BoardList[], current?: Layout): Layout {
  const ordered = readingOrder(panels, current);
  const slots: Slot[] = ordered.map((panel) => ({
    id: panel.id,
    kind: panel.kind,
    ideal: clampRect(panel.kind, { x: 0, y: 0, ...idealSize(panel) }),
  }));

  const layout: Layout = {};
  let top = 0;
  for (const row of partitionRows(slots)) {
    const widths = stretch(row);
    const tall = Math.max(...row.map((slot) => slot.ideal.h));
    let left = 0;
    row.forEach((slot, index) => {
      const small = slot.ideal.h < 5 && tall >= 5;
      const h = small ? slot.ideal.h : tall;
      layout[slot.id] = clampRect(slot.kind, { x: left, y: top, w: widths[index], h });
      left += widths[index];
    });
    top += tall;
  }
  return settle(layout);
}

/** What the server is sent. */
export function toPlacements(layout: Layout): Array<{ id: string } & Rect> {
  return Object.entries(layout).map(([id, rect]) => ({ id, ...rect }));
}

export function sameLayout(a: Layout, b: Layout): boolean {
  const ids = Object.keys(a);
  if (ids.length !== Object.keys(b).length) return false;
  return ids.every((id) => {
    const left = a[id];
    const right = b[id];
    return (
      right !== undefined &&
      left.x === right.x &&
      left.y === right.y &&
      left.w === right.w &&
      left.h === right.h
    );
  });
}

/** What a screen reader hears about a tile. Cells are counted from one. */
export function describeRect(rect: Rect): string {
  const columns = rect.w === 1 ? '1 column' : `${rect.w} columns`;
  const rows = rect.h === 1 ? '1 row' : `${rect.h} rows`;
  return `column ${rect.x + 1} of ${GRID_COLUMNS}, row ${rect.y + 1}, ${columns} wide, ${rows} tall`;
}

/** The order the tiles should be read and tabbed in. */
export function tabOrder(layout: Layout): string[] {
  return Object.keys(layout).sort(byPosition(layout));
}
