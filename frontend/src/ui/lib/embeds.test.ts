import { describe, expect, it } from 'vitest';

import { acceptsId, defaultTitle, embedSrc, parseEmbedUrl } from './embeds';

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
