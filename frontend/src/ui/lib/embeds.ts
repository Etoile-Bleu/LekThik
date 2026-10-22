import type { EmbedProvider } from './boardsApi';

export interface ProviderInfo {
  name: string;
  /** Who receives the reader's address when the content is loaded. */
  company: string;
  what: string;
  privacyUrl: string;
}

export const PROVIDERS: Record<EmbedProvider, ProviderInfo> = {
  youtube: {
    name: 'YouTube',
    company: 'Google',
    what: 'video',
    privacyUrl: 'https://policies.google.com/privacy',
  },
  vimeo: {
    name: 'Vimeo',
    company: 'Vimeo',
    what: 'video',
    privacyUrl: 'https://vimeo.com/privacy',
  },
  google_calendar: {
    name: 'Google Calendar',
    company: 'Google',
    what: 'calendar',
    privacyUrl: 'https://policies.google.com/privacy',
  },
};

export const PROVIDER_ORDER: EmbedProvider[] = ['youtube', 'vimeo', 'google_calendar'];

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;
const CALENDAR_ID = /^[A-Za-z0-9._%@+-]{3,250}$/;

export function acceptsId(provider: EmbedProvider, id: string): boolean {
  if (provider === 'youtube') return YOUTUBE_ID.test(id);
  if (provider === 'vimeo') return VIMEO_ID.test(id);
  return CALENDAR_ID.test(id);
}

/**
 * Recognises a video or calendar address, the same way the server does. The server has the last
 * word, this only lets the form say what it understood while someone types.
 */
export function parseEmbedUrl(input: string): { provider: EmbedProvider; id: string } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);
  let found: { provider: EmbedProvider; id: string | null } | null = null;

  if (
    [
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
      'www.youtube-nocookie.com',
      'youtube-nocookie.com',
    ].includes(host)
  ) {
    if (segments.length === 1 && segments[0] === 'watch') {
      found = { provider: 'youtube', id: url.searchParams.get('v') };
    } else if (segments.length === 2 && ['embed', 'shorts', 'live', 'v'].includes(segments[0])) {
      found = { provider: 'youtube', id: segments[1] };
    }
  } else if (host === 'youtu.be' && segments.length === 1) {
    found = { provider: 'youtube', id: segments[0] };
  } else if (host === 'vimeo.com' || host === 'www.vimeo.com') {
    const last = segments.at(-1);
    if (last && /^\d+$/.test(last)) found = { provider: 'vimeo', id: last };
  } else if (host === 'player.vimeo.com' && segments.length === 2 && segments[0] === 'video') {
    found = { provider: 'vimeo', id: segments[1] };
  } else if (host === 'calendar.google.com' && segments.join('/') === 'calendar/embed') {
    // The identifier is kept as written (still percent encoded), exactly as the server keeps it.
    const raw = /[?&]src=([^&#]*)/.exec(url.search)?.[1] ?? null;
    found = { provider: 'google_calendar', id: raw };
  }

  if (!found || !found.id || !acceptsId(found.provider, found.id)) return null;
  return { provider: found.provider, id: found.id };
}

/**
 * The address a frame is given. It is built from a provider and an identifier that have both been
 * checked, never from an address someone typed, so it can only ever point at that provider.
 */
export function embedSrc(provider: EmbedProvider, id: string): string | null {
  if (!acceptsId(provider, id)) return null;
  switch (provider) {
    case 'youtube':
      // The no cookie domain, and no related videos from other channels at the end.
      return `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
    case 'vimeo':
      // dnt=1 asks Vimeo not to track the viewer.
      return `https://player.vimeo.com/video/${id}?dnt=1`;
    case 'google_calendar':
      return `https://calendar.google.com/calendar/embed?src=${id}&mode=AGENDA&showTitle=0&showPrint=0&showTabs=0&showCalendars=0`;
  }
}

export function defaultTitle(provider: EmbedProvider): string {
  return provider === 'google_calendar' ? 'Google Calendar' : `${PROVIDERS[provider].name} video`;
}
