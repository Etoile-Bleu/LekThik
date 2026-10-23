import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

import { CheckIcon, ChevronRightIcon } from './Icons';
import './ContextMenu.css';

export type MenuEntry =
  | {
      type?: 'item';
      label: string;
      icon?: ReactNode;
      /** A reminder of the key that does the same, such as "Ctrl K". */
      shortcut?: string;
      danger?: boolean;
      disabled?: boolean;
      /** Makes the entry a check: it says whether it is on and toggles. */
      checked?: boolean;
      onSelect: () => void;
    }
  | { type: 'submenu'; label: string; icon?: ReactNode; disabled?: boolean; items: MenuEntry[] }
  | { type: 'separator' }
  | { type: 'heading'; label: string };

export interface ContextMenuState {
  x: number;
  y: number;
  /** Opened from the keyboard, so the first entry takes the focus at once. */
  keyboard: boolean;
  /** What had the focus, so it gets it back. */
  from: HTMLElement | null;
}

interface ContextMenuProps {
  state: ContextMenuState | null;
  label: string;
  entries: MenuEntry[];
  onClose: () => void;
}

const MARGIN = 8;

interface ListProps {
  entries: MenuEntry[];
  label: string;
  at: { x: number; y: number } | { anchor: DOMRect };
  depth: number;
  autoFocus: boolean;
  onPick: (entry: Extract<MenuEntry, { onSelect: () => void }>) => void;
  onLeave: () => void;
  onCloseAll: () => void;
}

function MenuList({
  entries,
  label,
  at,
  depth,
  autoFocus,
  onPick,
  onLeave,
  onCloseAll,
}: ListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const [openSub, setOpenSub] = useState<{ index: number; focus: boolean } | null>(null);
  const timer = useRef<number | null>(null);
  const typed = useRef({ text: '', at: 0 });
  const id = useId();

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const box = menu.getBoundingClientRect();
    let left: number;
    let top: number;
    if ('anchor' in at) {
      const room = window.innerWidth - at.anchor.right - MARGIN;
      left = room >= box.width ? at.anchor.right - 4 : at.anchor.left - box.width + 4;
      top = at.anchor.top - 6;
    } else {
      left = at.x;
      top = at.y;
    }
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - box.width - MARGIN));
    top = Math.max(MARGIN, Math.min(top, window.innerHeight - box.height - MARGIN));
    setPlace({ left, top });
  }, [at]);

  const items = useCallback(
    () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          ':scope > [data-entry]:not([aria-disabled="true"]), :scope > .ctx__submenu-wrap > [data-entry]:not([aria-disabled="true"])'
        ) ?? []
      ),
    []
  );

  useEffect(() => {
    if (!place) return;
    if (autoFocus) items()[0]?.focus();
    else ref.current?.focus({ preventScroll: true });
  }, [place, autoFocus, items]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  function move(step: number | 'first' | 'last') {
    const nodes = items();
    if (nodes.length === 0) return;
    const current = nodes.indexOf(document.activeElement as HTMLElement);
    const next =
      step === 'first'
        ? 0
        : step === 'last'
          ? nodes.length - 1
          : (current + step + nodes.length) % nodes.length;
    nodes[next].focus();
  }

  function typeahead(key: string) {
    const now = Date.now();
    const state = typed.current;
    state.text = now - state.at > 700 ? key : state.text + key;
    state.at = now;
    const nodes = items();
    const start = Math.max(0, nodes.indexOf(document.activeElement as HTMLElement));
    const ordered = [
      ...nodes.slice(start + (state.text.length === 1 ? 1 : 0)),
      ...nodes.slice(0, start + 1),
    ];
    const found = ordered.find((node) =>
      (node.textContent ?? '').trim().toLowerCase().startsWith(state.text.toLowerCase())
    );
    found?.focus();
  }

  function handleKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    // A submenu sits inside its parent in the tree, so a key it handled must not be handled twice.
    event.stopPropagation();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        move(-1);
        break;
      case 'Home':
        event.preventDefault();
        move('first');
        break;
      case 'End':
        event.preventDefault();
        move('last');
        break;
      case 'ArrowLeft':
        if (depth > 0) {
          event.preventDefault();
          event.stopPropagation();
          onLeave();
        }
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        if (depth > 0) onLeave();
        else onCloseAll();
        break;
      case 'Tab':
        onCloseAll();
        break;
      default:
        if (
          event.key.length === 1 &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          event.key !== ' '
        ) {
          typeahead(event.key);
        }
    }
  }

  function showSub(index: number, focus: boolean) {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setOpenSub({ index, focus });
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      className="ctx"
      data-depth={depth}
      style={
        place ? { left: place.left, top: place.top } : { left: 0, top: 0, visibility: 'hidden' }
      }
      onKeyDown={handleKey}
    >
      {entries.map((entry, index) => {
        if (entry.type === 'separator')
          return <div key={`s${index}`} role="separator" className="ctx__separator" />;
        if (entry.type === 'heading') {
          return (
            <div key={`h${index}`} role="presentation" className="ctx__heading">
              {entry.label}
            </div>
          );
        }
        const disabled = Boolean(entry.disabled);
        if (entry.type === 'submenu') {
          const opened = openSub?.index === index;
          return (
            <div key={`m${index}`} className="ctx__submenu-wrap">
              <div
                role="menuitem"
                tabIndex={-1}
                data-entry
                data-sub-index={index}
                aria-haspopup="menu"
                aria-expanded={opened}
                aria-disabled={disabled || undefined}
                aria-controls={opened ? `${id}-${index}` : undefined}
                className="ctx__item"
                onPointerEnter={(event) => {
                  if (disabled) return;
                  (event.currentTarget as HTMLElement).focus({ preventScroll: true });
                  if (timer.current !== null) window.clearTimeout(timer.current);
                  timer.current = window.setTimeout(() => showSub(index, false), 140);
                }}
                onClick={() => !disabled && showSub(index, true)}
                onKeyDown={(event) => {
                  if (disabled) return;
                  if (event.key === 'ArrowRight' || event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    showSub(index, true);
                  }
                }}
              >
                <span className="ctx__icon" aria-hidden="true">
                  {entry.icon}
                </span>
                <span className="ctx__label">{entry.label}</span>
                <ChevronRightIcon size={14} className="ctx__chevron" />
              </div>
              {opened && ref.current && (
                <MenuList
                  entries={entry.items}
                  label={entry.label}
                  at={{
                    anchor: (
                      ref.current.querySelector<HTMLElement>(`[data-sub-index="${index}"]`) ??
                      ref.current
                    ).getBoundingClientRect(),
                  }}
                  depth={depth + 1}
                  autoFocus={openSub?.focus ?? false}
                  onPick={onPick}
                  onLeave={() => {
                    setOpenSub(null);
                    ref.current?.querySelector<HTMLElement>(`[data-sub-index="${index}"]`)?.focus();
                  }}
                  onCloseAll={onCloseAll}
                />
              )}
            </div>
          );
        }
        const checkable = entry.checked !== undefined;
        return (
          <div
            key={`i${index}`}
            role={checkable ? 'menuitemcheckbox' : 'menuitem'}
            aria-checked={checkable ? entry.checked : undefined}
            aria-disabled={disabled || undefined}
            tabIndex={-1}
            data-entry
            className={`ctx__item${entry.danger ? ' ctx__item--danger' : ''}`}
            onPointerEnter={(event) => {
              if (disabled) return;
              (event.currentTarget as HTMLElement).focus({ preventScroll: true });
              if (openSub) {
                if (timer.current !== null) window.clearTimeout(timer.current);
                timer.current = window.setTimeout(() => setOpenSub(null), 140);
              }
            }}
            onClick={() => !disabled && onPick(entry)}
            onKeyDown={(event) => {
              if (disabled) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                onPick(entry);
              }
            }}
          >
            <span className="ctx__icon" aria-hidden="true">
              {checkable ? entry.checked ? <CheckIcon size={16} /> : null : entry.icon}
            </span>
            <span className="ctx__label">{entry.label}</span>
            {entry.shortcut && <kbd className="ctx__shortcut">{entry.shortcut}</kbd>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A menu that opens where the pointer is, in place of the browser's. It follows the ARIA menu
 * pattern: focus moves into it, the arrows, Home, End and the first letters move through it, the
 * right arrow opens a submenu and the left arrow or Escape closes it, Tab or a press outside
 * closes everything and focus goes back to where it was.
 */
export function ContextMenu({ state, label, entries, onClose }: ContextMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const close = useCallback(
    (restore: boolean) => {
      const from = stateRef.current?.from;
      onClose();
      if (restore)
        window.setTimeout(() => from?.isConnected && from.focus({ preventScroll: true }), 0);
    },
    [onClose]
  );

  useEffect(() => {
    if (!state) return undefined;
    function outside(event: PointerEvent) {
      if (!(event.target instanceof Node) || rootRef.current?.contains(event.target)) return;
      close(false);
    }
    function dismiss(event: Event) {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      close(false);
    }
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('blur', dismiss);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('blur', dismiss);
    };
  }, [state, close]);

  if (!state || entries.length === 0) return null;

  return createPortal(
    <div ref={rootRef} className="ctx-root">
      <MenuList
        entries={entries}
        label={label}
        at={{ x: state.x, y: state.y }}
        depth={0}
        autoFocus={state.keyboard}
        onPick={(entry) => {
          close(false);
          entry.onSelect();
        }}
        onLeave={() => undefined}
        onCloseAll={() => close(true)}
      />
    </div>,
    // Inside the app, where the theme's colours apply, and inside a dialog when it was opened from one.
    state.from?.closest('dialog') ??
      document.getElementById('main') ??
      document.querySelector('.shell') ??
      document.body
  );
}
