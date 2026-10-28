import { describe, expect, it } from 'vitest';

import { acceptsId, defaultTitle, embedSrc, openSrc, parseEmbedUrl } from './embeds';

describe('recognising an address', () => {
  it('understands every way to write a YouTube address', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/watch?v=dQw4w9WgXcQ&t=10',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    ]) {
      expect(parseEmbedUrl(url)).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ' });
    }
  });

  it('understands Vimeo and a Google Calendar', () => {
    expect(parseEmbedUrl('https://vimeo.com/76979871')).toEqual({
      provider: 'vimeo',
      id: '76979871',
    });
    expect(parseEmbedUrl('https://player.vimeo.com/video/76979871')).toEqual({
      provider: 'vimeo',
      id: '76979871',
    });
    expect(
      parseEmbedUrl('https://calendar.google.com/calendar/embed?src=team%40example.com&ctz=UTC')
    ).toEqual({ provider: 'google_calendar', id: 'team%40example.com' });
  });

  it('refuses other sites, other pages and anything that is not https', () => {
    for (const url of [
      '',
      'not a url',
      'https://evil.example/watch?v=dQw4w9WgXcQ',
      'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
      'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/',
      'https://www.youtube.com/channel/UC1234567',
      'https://user:pw@www.youtube.com/watch?v=dQw4w9WgXcQ',
      'javascript:alert(1)',
      'https://vimeo.com/channels/staffpicks',
      'https://calendar.google.com/calendar/u/0/r',
    ]) {
      expect(parseEmbedUrl(url)).toBeNull();
    }
  });

  it('refuses identifiers that could change the address built from them', () => {
    expect(parseEmbedUrl('https://www.youtube.com/watch?v=short')).toBeNull();
    expect(parseEmbedUrl('https://www.youtube.com/embed/dQw4w9WgXc%2F')).toBeNull();
    expect(parseEmbedUrl('https://vimeo.com/12345')).toBeNull();
    expect(parseEmbedUrl('https://calendar.google.com/calendar/embed?src=a')).toBeNull();
  });

  it('checks identifiers per provider', () => {
    expect(acceptsId('youtube', 'dQw4w9WgXcQ')).toBe(true);
    expect(acceptsId('youtube', 'dQw4w9WgXc"')).toBe(false);
    expect(acceptsId('vimeo', '76979871')).toBe(true);
    expect(acceptsId('vimeo', '7697987a')).toBe(false);
    expect(acceptsId('google_calendar', 'team%40example.com')).toBe(true);
    expect(acceptsId('google_calendar', 'a&b=c')).toBe(false);
  });
});

describe('Excalidraw, Figma and Notion addresses', () => {
  it('are recognised the same way the server does', () => {
    expect(
      parseEmbedUrl('https://excalidraw.com/#json=AbCdEf12345,Zx9Yw8Vu7Ts6Rq5Pn4Om3Lk')
    ).toEqual({ provider: 'excalidraw', id: 'json=AbCdEf12345,Zx9Yw8Vu7Ts6Rq5Pn4Om3Lk' });
    expect(
      parseEmbedUrl('https://www.figma.com/file/AbCdEf1234567890xyz/My-design?node-id=0%3A1')
    ).toEqual({ provider: 'figma', id: 'file/AbCdEf1234567890xyz' });
    expect(
      parseEmbedUrl('https://acme.notion.site/Roadmap-0123456789ABCDEF0123456789abcdef')
    ).toEqual({ provider: 'notion', id: 'acme/0123456789abcdef0123456789abcdef' });
    expect(parseEmbedUrl('https://acme.notion.site/ebd/0123456789abcdef0123456789abcdef')).toEqual({
      provider: 'notion',
      id: 'acme/0123456789abcdef0123456789abcdef',
    });
  });

  it('are refused when they are not a shared page, or come from another site', () => {
    for (const url of [
      'https://excalidraw.com/',
      'https://excalidraw.com/#json=abc,def',
      'https://excalidraw.com/draw#json=AbCdEf12345,Zx9Yw8Vu7Ts6Rq5Pn4Om3Lk',
      'https://excalidraw.com.evil.example/#json=AbCdEf12345,Zx9Yw8Vu7Ts6Rq5Pn4Om3Lk',
      'https://www.figma.com/community/file/1234567890123',
      'https://www.figma.com/file/short',
      'https://figma.com.evil.example/file/AbCdEf1234567890xyz/Name',
      'https://www.notion.so/Roadmap-0123456789abcdef0123456789abcdef',
      'https://a.b.notion.site/Roadmap-0123456789abcdef0123456789abcdef',
      'https://acme.notion.site/Roadmap-0123456789abcdef0123456789abcde',
      'https://acme.notion.site/Roadmap0123456789abcdef0123456789abcdef',
      'https://acme.notion.site.evil.example/Roadmap-0123456789abcdef0123456789abcdef',
      'http://excalidraw.com/#json=AbCdEf12345,Zx9Yw8Vu7Ts6Rq5Pn4Om3Lk',
    ]) {
      expect(parseEmbedUrl(url), url).toBeNull();
    }
  });

  it('check their identifiers when they come back from storage', () => {
    expect(acceptsId('excalidraw', 'room=0123456789abcdef0123,AbCdEfGhIjKlMnOpQrStUv')).toBe(true);
    expect(acceptsId('excalidraw', 'json=AbCdEf12345,Zx9Yw8Vu7Ts6Rq5Pn4Om3Lk/..')).toBe(false);
    expect(acceptsId('figma', 'proto/AbCdEf1234567890xyz')).toBe(true);
    expect(acceptsId('figma', 'file/AbCdEf1234567890xyz?x=1')).toBe(false);
    expect(acceptsId('notion', 'acme/0123456789abcdef0123456789abcdef')).toBe(true);
    expect(acceptsId('notion', 'ac.me/0123456789abcdef0123456789abcdef')).toBe(false);
    expect(acceptsId('notion', 'acme/0123456789ABCDEF0123456789ABCDEF')).toBe(false);
  });

  it('are given frames that only point at their provider, and builds nothing from bad ones', () => {
    expect(embedSrc('excalidraw', 'json=AbCdEf12345,Zx9Yw8Vu7Ts6Rq5Pn4Om3Lk')).toBe(
      'https://excalidraw.com/#json=AbCdEf12345,Zx9Yw8Vu7Ts6Rq5Pn4Om3Lk'
    );
    expect(embedSrc('figma', 'design/AbCdEf1234567890xyz')).toBe(
      'https://www.figma.com/embed?embed_host=lekthik&url=https%3A%2F%2Fwww.figma.com%2Fdesign%2FAbCdEf1234567890xyz'
    );
    expect(embedSrc('notion', 'acme/0123456789abcdef0123456789abcdef')).toBe(
      'https://acme.notion.site/ebd/0123456789abcdef0123456789abcdef'
    );
    expect(embedSrc('figma', 'file/x"onload=1')).toBeNull();
    expect(embedSrc('notion', 'evil.example/0123456789abcdef0123456789abcdef')).toBeNull();
    expect(embedSrc('excalidraw', 'json=a,b')).toBeNull();
  });

  it('can be opened as ordinary pages, and are named for people', () => {
    expect(openSrc('figma', 'file/AbCdEf1234567890xyz')).toBe(
      'https://www.figma.com/file/AbCdEf1234567890xyz'
    );
    expect(openSrc('notion', 'acme/0123456789abcdef0123456789abcdef')).toBe(
      'https://acme.notion.site/0123456789abcdef0123456789abcdef'
    );
    expect(openSrc('figma', 'nope')).toBeNull();
    expect(defaultTitle('figma')).toBe('Figma design');
    expect(defaultTitle('excalidraw')).toBe('Excalidraw drawing');
    expect(defaultTitle('notion')).toBe('Notion page');
  });
});

describe('the address a frame is given', () => {
  it('only ever points at the provider', () => {
    expect(embedSrc('youtube', 'dQw4w9WgXcQ')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0'
    );
    expect(embedSrc('vimeo', '76979871')).toBe('https://player.vimeo.com/video/76979871?dnt=1');
    expect(embedSrc('google_calendar', 'team%40example.com')).toContain(
      'https://calendar.google.com/calendar/embed?src=team%40example.com'
    );
  });

  it('builds nothing from an identifier that was not checked', () => {
    expect(embedSrc('youtube', 'x" onload="alert(1)')).toBeNull();
    expect(embedSrc('vimeo', '../../evil')).toBeNull();
    expect(embedSrc('google_calendar', 'a&b=c#d')).toBeNull();
  });

  it('names an embed in a way a person understands', () => {
    expect(defaultTitle('youtube')).toBe('YouTube video');
    expect(defaultTitle('google_calendar')).toBe('Google Calendar');
  });
});
