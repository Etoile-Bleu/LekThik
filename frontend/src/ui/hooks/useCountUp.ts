import { useEffect, useRef, useState } from 'react';

import { reducedMotion } from '@lib/motion';

const COUNT_MS = 600;

export function useCountUp(target: number | null): number | null {
  const [shown, setShown] = useState<number | null>(target);
  const first = useRef(true);

  useEffect(() => {
    if (target === null) {
      setShown(null);
      return undefined;
    }
    if (!first.current || reducedMotion() || target === 0) {
      first.current = false;
      setShown(target);
      return undefined;
    }
    first.current = false;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / COUNT_MS);
      const eased = 1 - (1 - progress) ** 3;
      setShown(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return shown;
}
