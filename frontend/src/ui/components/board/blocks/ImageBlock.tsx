import { useState } from 'react';

import { useBlockImage } from '@hooks/useBlockImage';
import { imageConfig } from '@lib/blocks';
import type { BoardList } from '@lib/boardsApi';

import { Dialog } from '../../ui/Dialog';
import { ImageIcon, UploadIcon } from '../../ui/Icons';
import './ImageBlock.css';

interface ImageBlockProps {
  block: BoardList;
  editable: boolean;
  onAddPicture: (blockId: string) => void;
}

/**
 * A picture kept by LekThik, shown to members of the workspace only. The description written when
 * it was added is its alternative text, so it is never missing. A press on the picture opens it
 * larger.
 */
export function ImageBlock({ block, editable, onAddPicture }: ImageBlockProps) {
  const config = imageConfig(block);
  const { status, url, retry } = useBlockImage(block.id, block.image_version ?? null);
  const [open, setOpen] = useState(false);

  if (status === 'none') {
    return (
      <div className="image-block image-block--empty">
        <ImageIcon size={26} />
        <p className="image-block__title">No picture yet</p>
        <p>{config.alt}</p>
        {editable && (
          <button
            type="button"
            className="btn btn--outline btn--sm"
            onClick={() => onAddPicture(block.id)}
          >
            <UploadIcon size={15} /> Add a picture
          </button>
        )}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="image-block image-block--empty" role="alert">
        <p className="image-block__title">The picture could not be loaded</p>
        <button type="button" className="btn btn--outline btn--sm" onClick={retry}>
          Try again
        </button>
      </div>
    );
  }

  if (status === 'loading' && !url) {
    return (
      <div className="image-block image-block--loading" role="status" aria-busy="true">
        <span className="sr-only">Loading the picture…</span>
      </div>
    );
  }

  return (
    <figure className="image-block">
      <button
        type="button"
        className="image-block__open"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <img src={url ?? undefined} alt={config.alt} decoding="async" />
        <span className="sr-only"> (opens larger)</span>
      </button>
      {config.caption && <figcaption className="image-block__caption">{config.caption}</figcaption>}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={config.caption || config.alt}
        size="lg"
      >
        <div className="image-block__large">
          <img src={url ?? undefined} alt={config.alt} />
          <p>{config.alt}</p>
        </div>
      </Dialog>
    </figure>
  );
}
