import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MediaDialog } from './MediaDialog';

function setup(kind: 'image' | 'embed' | 'link', onSubmit = vi.fn().mockResolvedValue(true)) {
  const onClose = vi.fn();
  render(<MediaDialog kind={kind} onSubmit={onSubmit} onClose={onClose} />);
  return { onSubmit, onClose };
}

function picture(name = 'plan.png', type = 'image/png', size = 2000): File {
  return new File([new Uint8Array(size)], name, { type });
}

function choose(file: File) {
  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe('MediaDialog for a picture', () => {
  it('needs a picture and a description before it will add anything', async () => {
    const { onSubmit } = setup('image');

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(onSubmit).not.toHaveBeenCalled();
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((alert) => alert.textContent)).toEqual(
      expect.arrayContaining(['Choose a picture.', 'Describe the picture.'])
    );
  });

  it('says what the description is for', () => {
    setup('image');

    expect(screen.getByText(/read out instead of the picture/)).toBeInTheDocument();
    expect(screen.getByLabelText('Describe the picture')).toHaveAttribute('aria-required', 'true');
  });

  it('says that location and camera details are removed, and who can see it', () => {
    setup('image');

    expect(screen.getByText(/removed for you/)).toBeInTheDocument();
    expect(screen.getByText(/only shown to members of this workspace/)).toBeInTheDocument();
  });

  it('refuses a file that is not a PNG, JPEG or WebP, or is too large', async () => {
    const { onSubmit } = setup('image');
    fireEvent.change(screen.getByLabelText('Describe the picture'), {
      target: { value: 'A plan' },
    });

    choose(picture('drawing.svg', 'image/svg+xml'));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('PNG, JPEG and WebP');

    choose(picture('huge.png', 'image/png', 5 * 1024 * 1024 + 1));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('5 MB'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('adds the picture with its description, caption and width', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    const { onSubmit, onClose } = setup('image');
    const file = picture();

    choose(file);
    fireEvent.change(screen.getByLabelText('Describe the picture'), {
      target: { value: 'Floor plan of the hall' },
    });
    fireEvent.change(screen.getByLabelText('Caption (optional)'), { target: { value: 'Level 1' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Normal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        kind: 'image',
        name: 'Level 1',
        config: { size: 'normal', alt: 'Floor plan of the hall', caption: 'Level 1' },
        file,
      })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('stays open when the picture could not be added', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    const { onClose } = setup('image', vi.fn().mockResolvedValue(false));
    choose(picture());
    fireEvent.change(screen.getByLabelText('Describe the picture'), {
      target: { value: 'A plan' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled());
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('MediaDialog for a video or calendar', () => {
  it('says what it understood while the address is typed, and suggests a name', async () => {
    setup('embed');

    fireEvent.change(screen.getByLabelText('Address of the video or calendar'), {
      target: { value: 'https://youtu.be/dQw4w9WgXcQ' },
    });

    expect(await screen.findByText('YouTube video found.')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('YouTube video');
  });

  it('does not overwrite a name that was already written', () => {
    setup('embed');
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My own name' } });

    fireEvent.change(screen.getByLabelText('Address of the video or calendar'), {
      target: { value: 'https://vimeo.com/76979871' },
    });

    expect(screen.getByLabelText('Name')).toHaveValue('My own name');
  });

  it('refuses addresses of other sites and says which are possible', async () => {
    const { onSubmit } = setup('embed');
    fireEvent.change(screen.getByLabelText('Address of the video or calendar'), {
      target: { value: 'https://evil.example/video' },
    });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Video' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only YouTube, Vimeo and Google Calendar addresses can be added.'
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('promises that nothing is loaded when it is added', () => {
    setup('embed');

    expect(
      screen.getByText(/Nothing is loaded from the provider when this is added/)
    ).toBeInTheDocument();
  });

  it('adds it with the address, the name and the width', async () => {
    const { onSubmit } = setup('embed');

    fireEvent.change(screen.getByLabelText('Address of the video or calendar'), {
      target: { value: 'https://youtu.be/dQw4w9WgXcQ' },
    });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Teaser' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        kind: 'embed',
        name: 'Teaser',
        config: { size: 'wide', url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Teaser' },
      })
    );
  });
});

describe('MediaDialog for a link', () => {
  it('refuses anything that is not a web address', async () => {
    const { onSubmit } = setup('link');

    for (const bad of ['javascript:alert(1)', 'example.com', 'ftp://example.com']) {
      fireEvent.change(screen.getByLabelText('Address of the page'), { target: { value: bad } });
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      expect(await screen.findByRole('alert')).toBeInTheDocument();
    }
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('names the block after the site when there is no title', async () => {
    const { onSubmit } = setup('link');

    fireEvent.change(screen.getByLabelText('Address of the page'), {
      target: { value: 'https://www.example.com/docs' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        kind: 'link',
        name: 'example.com',
        config: { size: 'normal', url: 'https://www.example.com/docs', title: '' },
      })
    );
  });

  it('says that nothing is fetched from the page', () => {
    setup('link');

    expect(screen.getByText(/Nothing is fetched from the page/)).toBeInTheDocument();
  });
});
