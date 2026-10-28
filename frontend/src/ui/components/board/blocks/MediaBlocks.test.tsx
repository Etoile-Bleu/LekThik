import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@lib/boardsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@lib/boardsApi')>();
  return { ...actual, fetchBlockImage: vi.fn() };
});

import { useAnnouncer } from '@lib/announcer';
import * as api from '@lib/boardsApi';
import type { BoardList } from '@lib/boardsApi';
import { useEmbedConsent } from '@lib/embedConsent';

import { EmbedBlock } from './EmbedBlock';
import { ImageBlock } from './ImageBlock';
import { LinkBlock } from './LinkBlock';

function block(
  kind: BoardList['kind'],
  config: BoardList['config'],
  extra: Partial<BoardList> = {}
): BoardList {
  return { id: 'blk', name: 'Block', wip_limit: null, kind, config, cards: [], ...extra };
}

describe('ImageBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:picture');
    URL.revokeObjectURL = vi.fn();
  });

  const config = { size: 'wide', alt: 'Floor plan of the hall', caption: 'Level 1' };

  it('shows the picture with its description as the alternative text and its caption', async () => {
    vi.mocked(api.fetchBlockImage).mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));

    render(
      <ImageBlock
        block={block('image', config, { id: 'a', image_version: 1 })}
        editable
        onAddPicture={vi.fn()}
      />
    );

    const image = await screen.findByRole('img', { name: 'Floor plan of the hall' });
    expect(image).toHaveAttribute('src', 'blob:picture');
    expect(screen.getByText('Level 1')).toBeInTheDocument();
    expect(api.fetchBlockImage).toHaveBeenCalledWith('a');
  });

  it('fetches a picture once per version, not once per drawing', async () => {
    vi.mocked(api.fetchBlockImage).mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
    const props = { editable: true, onAddPicture: vi.fn() };
    const { rerender } = render(
      <ImageBlock block={block('image', config, { id: 'b', image_version: 7 })} {...props} />
    );
    await screen.findByRole('img', { name: /Floor plan/ });

    rerender(
      <ImageBlock block={block('image', config, { id: 'b', image_version: 7 })} {...props} />
    );
    expect(api.fetchBlockImage).toHaveBeenCalledTimes(1);

    rerender(
      <ImageBlock block={block('image', config, { id: 'b', image_version: 8 })} {...props} />
    );
    await waitFor(() => expect(api.fetchBlockImage).toHaveBeenCalledTimes(2));
  });

  it('opens the picture larger, with its description beside it', async () => {
    vi.mocked(api.fetchBlockImage).mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
    render(
      <ImageBlock
        block={block('image', config, { id: 'c', image_version: 1 })}
        editable
        onAddPicture={vi.fn()}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: /Floor plan of the hall/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Level 1' });
    expect(dialog).toHaveTextContent('Floor plan of the hall');
  });

  it('invites the first picture, for people who can edit', () => {
    const onAddPicture = vi.fn();
    render(
      <ImageBlock
        block={block('image', config, { id: 'd', image_version: null })}
        editable
        onAddPicture={onAddPicture}
      />
    );

    expect(screen.getByText('No picture yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Add a picture/ }));
    expect(onAddPicture).toHaveBeenCalledWith('d');
  });

  it('offers nothing to add for people who cannot edit', () => {
    render(
      <ImageBlock
        block={block('image', config, { id: 'e', image_version: null })}
        editable={false}
        onAddPicture={vi.fn()}
      />
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says so, and offers to try again, when the picture cannot be loaded', async () => {
    vi.mocked(api.fetchBlockImage).mockRejectedValueOnce(new Error('offline'));
    vi.mocked(api.fetchBlockImage).mockResolvedValueOnce(new Blob(['x'], { type: 'image/png' }));
    render(
      <ImageBlock
        block={block('image', config, { id: 'f', image_version: 1 })}
        editable
        onAddPicture={vi.fn()}
      />
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('img', { name: /Floor plan/ })).toBeInTheDocument();
  });
});

describe('EmbedBlock', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useEmbedConsent.setState({ allowed: {} });
    useAnnouncer.setState({ message: '', tick: 0 });
  });

  const youtube = { size: 'wide', provider: 'youtube', id: 'dQw4w9WgXcQ', title: 'Launch teaser' };

  it('requests nothing from the provider until someone asks: no frame at all', () => {
    const { container } = render(<EmbedBlock block={block('embed', youtube)} />);

    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Launch teaser')).toBeInTheDocument();
  });

  it('says who would receive what, before anything is loaded', () => {
    render(<EmbedBlock block={block('embed', youtube)} />);

    expect(
      screen.getByText(/Google will receive your IP address and may set cookies/)
    ).toBeInTheDocument();
    expect(screen.getByText(/Nothing has been requested yet/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /YouTube privacy policy/ })).toHaveAttribute(
      'href',
      'https://policies.google.com/privacy'
    );
  });

  it('loads the frame after a press, from the no cookie address, titled and sandboxed', () => {
    const { container } = render(<EmbedBlock block={block('embed', youtube)} />);

    fireEvent.click(screen.getByRole('button', { name: 'Play the video' }));

    const frame = container.querySelector('iframe');
    expect(frame).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0'
    );
    expect(frame).toHaveAttribute('title', 'Launch teaser');
    expect(frame?.getAttribute('sandbox')).toContain('allow-scripts');
    expect(frame?.getAttribute('sandbox')).not.toContain('allow-top-navigation');
    expect(frame).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    expect(useAnnouncer.getState().message).toContain('Loading YouTube');
  });

  it('does not remember the choice unless asked', () => {
    render(<EmbedBlock block={block('embed', youtube)} />);

    fireEvent.click(screen.getByRole('button', { name: 'Play the video' }));

    expect(useEmbedConsent.getState().allowed.youtube).toBeUndefined();
    expect(window.localStorage.getItem('lekthik.embeds.v1')).toBeNull();
  });

  it('remembers the choice for that provider on this device when asked, and then loads at once', () => {
    const { container, unmount } = render(<EmbedBlock block={block('embed', youtube)} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Remember for YouTube/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Play the video' }));
    expect(useEmbedConsent.getState().allowed.youtube).toBe(true);
    unmount();

    const again = render(<EmbedBlock block={block('embed', { ...youtube, id: 'aaaaaaaaaaa' })} />);
    expect(again.container.querySelector('iframe')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/aaaaaaaaaaa?rel=0'
    );
    expect(container).toBeDefined();
  });

  it('does not let a choice for one provider load another', () => {
    useEmbedConsent.getState().allow('youtube');

    const { container } = render(
      <EmbedBlock
        block={block('embed', { size: 'wide', provider: 'vimeo', id: '76979871', title: 'Demo' })}
      />
    );

    expect(container.querySelector('iframe')).toBeNull();
  });

  it('can stop and take the frame off the page again', () => {
    const { container } = render(<EmbedBlock block={block('embed', youtube)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play the video' }));

    fireEvent.click(screen.getByRole('button', { name: 'Stop and remove' }));

    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('button', { name: 'Play the video' })).toBeInTheDocument();
  });

  it('words a calendar as a calendar', () => {
    render(
      <EmbedBlock
        block={block('embed', {
          size: 'wide',
          provider: 'google_calendar',
          id: 'team%40example.com',
          title: 'Team calendar',
        })}
      />
    );

    expect(screen.getByRole('button', { name: 'Show the calendar' })).toBeInTheDocument();
    expect(screen.getByText(/Google will receive/)).toBeInTheDocument();
  });

  it('never builds a frame from an identifier that does not check out', () => {
    const { container } = render(
      <EmbedBlock
        block={block('embed', {
          size: 'wide',
          provider: 'youtube',
          id: 'x" onload="alert(1)',
          title: 'Bad',
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Play the video' }));

    expect(container.querySelector('iframe')).toBeNull();
  });

  it('says what to do when an embed has nothing to show', () => {
    render(<EmbedBlock block={block('embed', {})} />);

    expect(screen.getByText(/shows nothing yet/)).toBeInTheDocument();
  });

  it.each([
    [
      'excalidraw',
      'json=AbCdEf12345,Zx9Yw8Vu7Ts6Rq5Pn4Om3Lk',
      'Show the drawing',
      'https://excalidraw.com/#json=AbCdEf12345,Zx9Yw8Vu7Ts6Rq5Pn4Om3Lk',
      'https://excalidraw.com/#json=AbCdEf12345,Zx9Yw8Vu7Ts6Rq5Pn4Om3Lk',
    ],
    [
      'figma',
      'design/AbCdEf1234567890xyz',
      'Show the design',
      'https://www.figma.com/embed?embed_host=lekthik&url=https%3A%2F%2Fwww.figma.com%2Fdesign%2FAbCdEf1234567890xyz',
      'https://www.figma.com/design/AbCdEf1234567890xyz',
    ],
    [
      'notion',
      'acme/0123456789abcdef0123456789abcdef',
      'Show the page',
      'https://acme.notion.site/ebd/0123456789abcdef0123456789abcdef',
      'https://acme.notion.site/0123456789abcdef0123456789abcdef',
    ],
  ])(
    'holds %s back until the button, then shows a sandboxed frame and a way to open it',
    (provider, id, action, frame, page) => {
      const { container } = render(
        <EmbedBlock block={block('embed', { size: 'wide', provider, id, title: 'Outside' })} />
      );

      expect(container.querySelector('iframe')).toBeNull();
      expect(screen.getByText(/will receive your IP address/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: action }));

      const iframe = container.querySelector('iframe');
      expect(iframe).toHaveAttribute('src', frame);
      expect(iframe).toHaveAttribute('title', 'Outside');
      expect(iframe?.getAttribute('sandbox')).not.toMatch(/allow-top-navigation|allow-forms/);
      expect(screen.getByRole('link', { name: /Open it in a new tab/ })).toHaveAttribute(
        'href',
        page
      );
    }
  );
});

describe('LinkBlock', () => {
  it('shows the title and the real site, and opens safely in a new tab', () => {
    render(
      <LinkBlock
        block={block('link', {
          size: 'normal',
          url: 'https://www.example.com/docs',
          title: 'Project docs',
        })}
      />
    );

    const link = screen.getByRole('link', { name: /Project docs/ });
    expect(link).toHaveAttribute('href', 'https://www.example.com/docs');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(link).toHaveTextContent('example.com');
    expect(link).toHaveTextContent('(opens in a new tab)');
  });

  it('fetches nothing: no picture, no icon', () => {
    const { container } = render(
      <LinkBlock block={block('link', { size: 'normal', url: 'https://example.com', title: '' })} />
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('link')).toHaveTextContent('example.com');
  });
});
