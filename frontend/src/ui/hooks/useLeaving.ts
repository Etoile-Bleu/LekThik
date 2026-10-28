import { useEffect, useRef, useState } from 'react';

function reducedMotion(): boolean {
  return (
    document.documentElement.dataset.motion === 'reduce' ||
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  );
}

export interface Staged<T> {
  item: T;
  /** True for the moment an item that is gone stays on screen to fade out. */
  leaving: boolean;
}

/**
 * Keeps an item that disappeared on screen for a short while, flagged as leaving, so it can play
 * an exit animation before it goes. With reduced motion it goes at once.
 */
export function useLeaving<T>(
  items: T[],
  keyOf: (item: T) => string,
  delay = 260
): Array<Staged<T>> {
  const [gone, setGone] = useState<Array<{ item: T; at: number }>>([]);
  const previous = useRef<T[]>(items);

  useEffect(() => {
    const now = new Set(items.map(keyOf));
    const left = previous.current.filter((item) => !now.has(keyOf(item)));
    previous.current = items;
    if (left.length === 0 || reducedMotion()) return undefined;
    const stamp = Date.now();
    setGone((current) => [
      ...current.filter((entry) => !now.has(keyOf(entry.item))),
      ...left.map((item) => ({ item, at: stamp })),
    ]);
    const timer = window.setTimeout(
      () => setGone((current) => current.filter((entry) => entry.at !== stamp)),
      delay
    );
    return () => window.clearTimeout(timer);
    // keyOf is a plain function of the item and does not need to restart this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, delay]);

  const present = new Set(items.map(keyOf));
  return [
    ...items.map((item) => ({ item, leaving: false })),
    ...gone
      .filter((entry) => !present.has(keyOf(entry.item)))
      .map((entry) => ({ item: entry.item, leaving: true })),
  ];
}
