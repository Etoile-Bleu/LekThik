import { useEffect, useState } from 'react';

import { toDayString } from '@lib/dueDate';

function msUntilMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime() + 1000;
}

/** The viewer's local day, refreshed at midnight so badges turn overdue on their own. */
export function useToday(): string {
  const [today, setToday] = useState(() => toDayString(new Date()));

  useEffect(() => {
    const timer = window.setTimeout(
      () => setToday(toDayString(new Date())),
      msUntilMidnight(new Date())
    );
    return () => window.clearTimeout(timer);
  }, [today]);

  return today;
}
