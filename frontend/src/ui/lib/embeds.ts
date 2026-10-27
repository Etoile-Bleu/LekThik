import type { EmbedProvider } from './boardsApi';

export interface ProviderInfo {
  name: string;
  /** Who receives the reader's address when the content is loaded. */
  company: string;
  what: string;
  privacyUrl: string;
  /** The button that asks for the content. */
  action: string;
  /** Roughly what shape the frame takes. */
  shape: 'video' | 'calendar' | 'canvas';
}

export const PROVIDERS: Record<EmbedProvider, ProviderInfo> = {
  youtube: {
    name: 'YouTube',
    company: 'Google',
    what: 'video',
    privacyUrl: 'https://policies.google.com/privacy',
    action: 'Play the video',
    shape: 'video',
  },
  vimeo: {
    name: 'Vimeo',
    company: 'Vimeo',
    what: 'video',
    privacyUrl: 'https://vimeo.com/privacy',
    action: 'Play the video',
    shape: 'video',
  },
  google_calendar: {
    name: 'Google Calendar',
    company: 'Google',
    what: 'calendar',
    privacyUrl: 'https://policies.google.com/privacy',
    action: 'Show the calendar',
    shape: 'calendar',
  },
  excalidraw: {
    name: 'Excalidraw',
    company: 'Excalidraw',
    what: 'drawing',
    privacyUrl: 'https://plus.excalidraw.com/privacy-policy',
    action: 'Show the drawing',
    shape: 'canvas',
  },
  figma: {
    name: 'Figma',
    company: 'Figma',
    what: 'design',
    privacyUrl: 'https://www.figma.com/legal/privacy/',
    action: 'Show the design',
    shape: 'canvas',
  },
  notion: {
    name: 'Notion',
    company: 'Notion Labs',
    what: 'page',
    privacyUrl: 'https://www.notion.com/help/privacy',
    action: 'Show the page',
    shape: 'canvas',
  },
};

export const PROVIDER_ORDER: EmbedProvider[] = [
  'youtube',
  'vimeo',
  'google_calendar',
  'excalidraw',
  'figma',
  'notion',
];

export const PROVIDER_NAMES = 'YouTube, Vimeo, Google Calendar, Excalidraw, Figma or Notion';

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;
const CALENDAR_ID = /^[A-Za-z0-9._%@+-]{3,250}$/;
const EXCALIDRAW_ID = /^(json|room)=[A-Za-z0-9_-]{6,64},[A-Za-z0-9_-]{6,64}$/;
const FIGMA_ID = /^(file|design|proto|board)\/[A-Za-z0-9]{10,40}$/;
const NOTION_ID = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\/[0-9a-f]{32}$/;
const NOTION_TAIL = /(?:^|-)([0-9a-fA-F]{32})$/;

export function acceptsId(provider: EmbedProvider, id: string): boolean {
  switch (provider) {
    case 'youtube':
      return YOUTUBE_ID.test(id);
    case 'vimeo':
      return VIMEO_ID.test(id);
    case 'google_calendar':
      return CALENDAR_ID.test(id);
    case 'excalidraw':
      return EXCALIDRAW_ID.test(id);
    case 'figma':
      return FIGMA_ID.test(id);
    case 'notion':
      return NOTION_ID.test(id);
  }
}

interface Found {
  provider: EmbedProvider;
  id: string | null;
}

function recognise(url: URL): Found | null {
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);

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
      return { provider: 'youtube', id: url.searchParams.get('v') };
    }
    if (segments.length === 2 && ['embed', 'shorts', 'live', 'v'].includes(segments[0])) {
      return { provider: 'youtube', id: segments[1] };
    }
    return null;
  }
  if (host === 'youtu.be' && segments.length === 1) {
    return { provider: 'youtube', id: segments[0] };
  }
  if (host === 'vimeo.com' || host === 'www.vimeo.com') {
    const last = segments.at(-1);
    return last && /^\d+$/.test(last) ? { provider: 'vimeo', id: last } : null;
  }
  if (host === 'player.vimeo.com' && segments.length === 2 && segments[0] === 'video') {
    return { provider: 'vimeo', id: segments[1] };
  }
  if (host === 'calendar.google.com' && segments.join('/') === 'calendar/embed') {
    const raw = /[?&]src=([^&#]*)/.exec(url.search)?.[1] ?? null;
    return { provider: 'google_calendar', id: raw };
  }
  if ((host === 'excalidraw.com' || host === 'www.excalidraw.com') && segments.length === 0) {
    return { provider: 'excalidraw', id: url.hash.slice(1) };
  }
  if ((host === 'figma.com' || host === 'www.figma.com') && segments.length >= 2) {
    return ['file', 'design', 'proto', 'board'].includes(segments[0])
      ? { provider: 'figma', id: `${segments[0]}/${segments[1]}` }
      : null;
  }
  if (host.endsWith('.notion.site')) {
    const subdomain = host.slice(0, -'.notion.site'.length);
    const slug =
      segments.length === 1
        ? segments[0]
        : segments.length === 2 && segments[0] === 'ebd'
          ? segments[1]
          : null;
    const page = slug ? NOTION_TAIL.exec(slug)?.[1]?.toLowerCase() : null;
    return page && !subdomain.includes('.')
      ? { provider: 'notion', id: `${subdomain}/${page}` }
      : null;
  }
  return null;
}

/**
 * Recognises an address of a known provider, the same way the server does. The server has the last
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

  const found = recognise(url);
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
      return `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
    case 'vimeo':
      return `https://player.vimeo.com/video/${id}?dnt=1`;
    case 'google_calendar':
      return `https://calendar.google.com/calendar/embed?src=${id}&mode=AGENDA&showTitle=0&showPrint=0&showTabs=0&showCalendars=0`;
    case 'excalidraw':
      return `https://excalidraw.com/#${id}`;
    case 'figma': {
      const page = encodeURIComponent(`https://www.figma.com/${id}`);
      return `https://www.figma.com/embed?embed_host=lekthik&url=${page}`;
    }
    case 'notion': {
      const [subdomain, page] = id.split('/');
      return `https://${subdomain}.notion.site/ebd/${page}`;
    }
  }
}

/**
 * Where the same content lives as an ordinary page, for the link that opens it in a new tab when a
 * provider refuses to be shown in a frame.
 */
export function openSrc(provider: EmbedProvider, id: string): string | null {
  if (!acceptsId(provider, id)) return null;
  switch (provider) {
    case 'figma':
      return `https://www.figma.com/${id}`;
    case 'notion': {
      const [subdomain, page] = id.split('/');
      return `https://${subdomain}.notion.site/${page}`;
    }
    case 'youtube':
      return `https://www.youtube.com/watch?v=${id}`;
    case 'vimeo':
      return `https://vimeo.com/${id}`;
    default:
      return embedSrc(provider, id);
  }
}

export function defaultTitle(provider: EmbedProvider): string {
  switch (provider) {
    case 'google_calendar':
      return 'Google Calendar';
    case 'excalidraw':
    case 'figma':
    case 'notion':
      return `${PROVIDERS[provider].name} ${PROVIDERS[provider].what}`;
    default:
      return `${PROVIDERS[provider].name} video`;
  }
}
