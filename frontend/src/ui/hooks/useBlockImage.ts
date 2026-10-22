import { useCallback, useEffect, useState } from 'react';

import { fetchBlockImage } from '@lib/boardsApi';

export type ImageStatus = 'none' | 'loading' | 'ready' | 'error';

const MAX_KEPT = 40;
// Pictures are fetched once per version and kept as object URLs for the life of the page.
const kept = new Map<string, string>();

function remember(block: string, version: number, url: string) {
  for (const [key, old] of kept) {
    if (key.startsWith(`${block}:`) && key !== `${block}:${version}`) {
      URL.revokeObjectURL(old);
      kept.delete(key);
    }
  }
  kept.set(`${block}:${version}`, url);
  while (kept.size > MAX_KEPT) {
    const oldest = kept.keys().next().value as string;
    URL.revokeObjectURL(kept.get(oldest) as string);
    kept.delete(oldest);
  }
}

/**
 * The picture of an image block as a URL the page can show. The picture is only available to
 * members, so it is fetched with the session and turned into a local address, and a new version
 * replaces the old one.
 */
export function useBlockImage(blockId: string, version: number | null) {
  const key = version === null ? null : `${blockId}:${version}`;
  const [state, setState] = useState<{ status: ImageStatus; url: string | null }>(() =>
    key && kept.has(key)
      ? { status: 'ready', url: kept.get(key) as string }
      : { status: version === null ? 'none' : 'loading', url: null }
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (version === null || key === null) {
      setState({ status: 'none', url: null });
      return undefined;
    }
    const cached = kept.get(key);
    if (cached) {
      setState({ status: 'ready', url: cached });
      return undefined;
    }

    let cancelled = false;
    setState((current) => ({ status: 'loading', url: current.url }));
    fetchBlockImage(blockId)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        remember(blockId, version, url);
        if (!cancelled) setState({ status: 'ready', url });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', url: null });
      });
    return () => {
      cancelled = true;
    };
  }, [blockId, version, key, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, retry };
}
