import { useLayoutEffect, useRef } from 'react';

function reducedMotion(): boolean {
  return (
    document.documentElement.dataset.motion === 'reduce' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Lets the children of a list glide to their new place when their order
 * changes (FLIP: first, last, invert, play). Children name themselves with
 * `data-flip`. Nothing runs when motion is reduced.
 */
export function useFlip<T extends HTMLElement>(order: string) {
  const ref = useRef<T>(null);
  const tops = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const next = new Map<string, number>();
    const skip = reducedMotion();

    for (const child of Array.from(node.children) as HTMLElement[]) {
      const key = child.dataset.flip;
      if (!key) continue;
      const top = child.getBoundingClientRect().top;
      next.set(key, top);
      const before = tops.current.get(key);
      if (before !== undefined && !skip && typeof child.animate === 'function') {
        const delta = before - top;
        if (delta !== 0) {
          child.animate([{ transform: `translateY(${delta}px)` }, { transform: 'none' }], {
            duration: 220,
            easing: 'cubic-bezier(0.2, 0, 0, 1)',
          });
        }
      }
    }
    tops.current = next;
  }, [order]);

  return ref;
}
