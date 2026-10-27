import { useEffect, useState } from 'react';

import { msUntilNextMinute } from '@lib/clocks';

export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer = 0;
    const tick = () => {
      const current = new Date();
      setNow(current);
      timer = window.setTimeout(tick, msUntilNextMinute(current));
    };
    timer = window.setTimeout(tick, msUntilNextMinute(new Date()));
    const resync = () => {
      if (document.hidden) return;
      window.clearTimeout(timer);
      tick();
    };
    document.addEventListener('visibilitychange', resync);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', resync);
    };
  }, []);

  return now;
}
