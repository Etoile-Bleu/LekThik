import { useEffect, useRef, useState } from 'react';

/**
 * True for a moment after a panel that was folded opens again, so it can grow
 * out of its rail with its contents clipped meanwhile.
 */
export function useOpening(collapsed: boolean): boolean {
  const wasCollapsed = useRef(collapsed);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (wasCollapsed.current && !collapsed) {
      setOpening(true);
      const timer = window.setTimeout(() => setOpening(false), 260);
      wasCollapsed.current = collapsed;
      return () => window.clearTimeout(timer);
    }
    wasCollapsed.current = collapsed;
    return undefined;
  }, [collapsed]);

  return opening;
}
