import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import './Popover.css';

interface PopoverProps {
  /** Names both the button and the panel. */
  label: string;
  trigger: ReactNode;
  triggerClassName?: string;
  align?: 'start' | 'end';
  children: (close: () => void) => ReactNode;
}

interface Position {
  top: number;
  left: number;
}

const GAP = 8;
const MARGIN = 8;
const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * A panel that opens under its button, for settings you adjust and watch take
 * effect. It sits right after the button in the DOM so Tab flows into it, it
 * is not modal, Escape and a click outside close it, and on narrow screens it
 * becomes a bottom sheet with a scrim.
 */
export function Popover({
  label,
  trigger,
  triggerClassName = 'btn btn--outline btn--sm',
  align = 'end',
  children,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    setPosition(null);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !panelRef.current) {
      return;
    }
    const anchor = triggerRef.current.getBoundingClientRect();
    const panel = panelRef.current.getBoundingClientRect();
    const rawLeft = align === 'end' ? anchor.right - panel.width : anchor.left;
    const left = Math.max(MARGIN, Math.min(rawLeft, window.innerWidth - panel.width - MARGIN));
    const fitsBelow = anchor.bottom + GAP + panel.height <= window.innerHeight - MARGIN;
    const top = fitsBelow
      ? anchor.bottom + GAP
      : Math.max(MARGIN, window.innerHeight - panel.height - MARGIN);
    setPosition({ top, left });
  }, [open, align]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        close(false);
      }
    }

    function handleResize() {
      close(false);
    }

    document.addEventListener('keydown', handleKey, true);
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('keydown', handleKey, true);
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [open, close]);

  useEffect(() => {
    if (open && position) {
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panelRef.current)?.focus();
    }
  }, [open, position]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        {trigger}
      </button>
      {open && (
        <>
          <div className="popover-scrim" aria-hidden="true" onClick={() => close(false)} />
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label={label}
            tabIndex={-1}
            className="popover"
            style={
              {
                '--pop-top': `${position?.top ?? 0}px`,
                '--pop-left': `${position?.left ?? 0}px`,
                visibility: position ? 'visible' : 'hidden',
              } as React.CSSProperties
            }
          >
            {children(() => close(true))}
          </div>
        </>
      )}
    </>
  );
}
