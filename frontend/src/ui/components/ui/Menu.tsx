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

import { DotsIcon } from './Icons';
import './Menu.css';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  icon?: ReactNode;
  tone?: 'danger';
  disabled?: boolean;
}

interface MenuProps {
  label: string;
  items: MenuItem[];
  trigger?: ReactNode;
  align?: 'start' | 'end';
  triggerClassName?: string;
}

interface Position {
  top: number;
  left: number;
}

const GAP = 6;
const VIEWPORT_MARGIN = 8;

export function Menu({
  label,
  items,
  trigger,
  align = 'end',
  triggerClassName = 'icon-button',
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    setPosition(null);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) {
      return;
    }
    const anchor = triggerRef.current.getBoundingClientRect();
    const menu = menuRef.current.getBoundingClientRect();
    const rawLeft = align === 'end' ? anchor.right - menu.width : anchor.left;
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(rawLeft, window.innerWidth - menu.width - VIEWPORT_MARGIN)
    );
    const fitsBelow = anchor.bottom + GAP + menu.height <= window.innerHeight - VIEWPORT_MARGIN;
    const top = fitsBelow
      ? anchor.bottom + GAP
      : Math.max(VIEWPORT_MARGIN, anchor.top - GAP - menu.height);
    setPosition({ top, left });
  }, [open, align]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const enabled = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)');
    enabled?.focus();

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        close(false);
      }
    }

    function handleDismiss() {
      close(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', handleDismiss);
    window.addEventListener('scroll', handleDismiss, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', handleDismiss);
      window.removeEventListener('scroll', handleDismiss, true);
    };
  }, [open, close]);

  function focusItem(step: number | 'first' | 'last') {
    const nodes = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []
    );
    if (nodes.length === 0) {
      return;
    }
    const current = nodes.indexOf(document.activeElement as HTMLElement);
    let next = 0;
    if (step === 'first') next = 0;
    else if (step === 'last') next = nodes.length - 1;
    else next = (current + step + nodes.length) % nodes.length;
    nodes[next].focus();
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusItem(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusItem(-1);
        break;
      case 'Home':
        event.preventDefault();
        focusItem('first');
        break;
      case 'End':
        event.preventDefault();
        focusItem('last');
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
      default:
        break;
    }
  }

  function select(item: MenuItem) {
    close(false);
    item.onSelect();
    window.setTimeout(() => {
      const trigger = triggerRef.current;
      const active = document.activeElement;
      if (trigger?.isConnected && (!active || active === document.body)) {
        trigger.focus();
      }
    }, 0);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {trigger ?? <DotsIcon />}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            className="menu"
            style={{
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              visibility: position ? 'visible' : 'hidden',
            }}
            onKeyDown={handleMenuKeyDown}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={item.disabled}
                className={`menu__item${item.tone === 'danger' ? ' menu__item--danger' : ''}`}
                onClick={() => select(item)}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
