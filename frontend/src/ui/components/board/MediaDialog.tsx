import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react';

import type { BlockSize, PanelConfig, PanelKind } from '@lib/boardsApi';
import { PROVIDERS, defaultTitle, parseEmbedUrl } from '@lib/embeds';
import { PICTURE_TYPES, checkPicture, checkWebAddress } from '@lib/media';

import { Dialog } from '../ui/Dialog';
import { UploadIcon } from '../ui/Icons';
import { Segmented } from '../ui/Segmented';
import './MediaDialog.css';

export type MediaKind = Extract<PanelKind, 'image' | 'embed' | 'link'>;

export interface MediaInput {
  kind: MediaKind;
  name: string;
  config: PanelConfig;
  file?: File;
}

interface MediaDialogProps {
  kind: MediaKind | null;
  /** Resolves true when the block was added, which closes the dialog. */
  onSubmit: (input: MediaInput) => Promise<boolean>;
  onClose: () => void;
}

const SIZES: Array<{ value: BlockSize; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'wide', label: 'Wide' },
];

const TITLES: Record<MediaKind, string> = {
  image: 'Add a picture',
  embed: 'Add a video or calendar',
  link: 'Add a link',
};

/** The form that adds a picture, a video or calendar, or a link, and says what it understood. */
export function MediaDialog({ kind, onSubmit, onClose }: MediaDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [alt, setAlt] = useState('');
  const [caption, setCaption] = useState('');
  const [size, setSize] = useState<BlockSize>('wide');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const ids = useId();

  useEffect(() => {
    if (kind) {
      setFile(null);
      setUrl('');
      setTitle('');
      setAlt('');
      setCaption('');
      setSize(kind === 'link' ? 'normal' : 'wide');
      setTouched(false);
      setBusy(false);
    }
  }, [kind]);

  const preview = useMemo(
    () => (file && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null),
    [file]
  );
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  if (!kind) {
    return (
      <Dialog open={false} onClose={onClose} title="Add a block" size="md">
        <div />
      </Dialog>
    );
  }

  const recognised = kind === 'embed' ? parseEmbedUrl(url) : null;
  const fileProblem = kind === 'image' ? checkPicture(file) : null;
  const altProblem = kind === 'image' && alt.trim() === '' ? 'Describe the picture.' : null;
  const urlProblem =
    kind === 'embed'
      ? url.trim() === ''
        ? 'Paste the address of a video or calendar.'
        : recognised
          ? null
          : 'Only YouTube, Vimeo and Google Calendar addresses can be added.'
      : kind === 'link'
        ? checkWebAddress(url)
        : null;
  const titleProblem =
    kind === 'embed' && title.trim() === '' ? 'Name it, for people who cannot see it.' : null;
  const problem = fileProblem ?? altProblem ?? urlProblem ?? titleProblem;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (problem || !kind) return;

    let input: MediaInput;
    if (kind === 'image') {
      input = {
        kind,
        name: caption.trim() || 'Picture',
        config: { size, alt: alt.trim(), caption: caption.trim() },
        file: file ?? undefined,
      };
    } else if (kind === 'embed') {
      input = { kind, name: title.trim(), config: { size, url: url.trim(), title: title.trim() } };
    } else {
      const host = (() => {
        try {
          return new URL(url.trim()).host.replace(/^www\./, '');
        } catch {
          return 'Link';
        }
      })();
      input = {
        kind,
        name: title.trim() || host,
        config: { size, url: url.trim(), title: title.trim() },
      };
    }

    setBusy(true);
    const done = await onSubmit(input);
    setBusy(false);
    if (done) onClose();
  }

  return (
    <Dialog open onClose={onClose} title={TITLES[kind]} size="md">
      <form className="media-dialog" onSubmit={submit} noValidate>
        <h2 className="media-dialog__title">{TITLES[kind]}</h2>

        {kind === 'image' && (
          <>
            <div className="media-dialog__field">
              <span className="media-dialog__label" id={`${ids}-file-label`}>
                Picture
              </span>
              <div className="media-dialog__picker">
                <button
                  type="button"
                  className="btn btn--outline"
                  aria-describedby={`${ids}-file-help`}
                  onClick={() => fileInput.current?.click()}
                >
                  <UploadIcon size={16} /> {file ? 'Choose another' : 'Choose a picture'}
                </button>
                <span className="media-dialog__file">{file ? file.name : 'No file chosen'}</span>
                <input
                  ref={fileInput}
                  type="file"
                  className="sr-only"
                  accept={PICTURE_TYPES.join(',')}
                  tabIndex={-1}
                  aria-labelledby={`${ids}-file-label`}
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
              </div>
              <p id={`${ids}-file-help`} className="media-dialog__hint">
                PNG, JPEG or WebP, up to 5 MB. Where it was taken and with what camera is removed
                for you, and it is only shown to members of this workspace.
              </p>
              {preview && <img className="media-dialog__preview" src={preview} alt="" />}
              {touched && fileProblem && (
                <p className="media-dialog__error" role="alert">
                  {fileProblem}
                </p>
              )}
            </div>

            <div className="field">
              <label htmlFor={`${ids}-alt`}>Describe the picture</label>
              <textarea
                id={`${ids}-alt`}
                rows={3}
                maxLength={300}
                value={alt}
                aria-required="true"
                aria-invalid={(touched && altProblem !== null) || undefined}
                aria-describedby={`${ids}-alt-help`}
                onChange={(event) => setAlt(event.target.value)}
              />
              <p id={`${ids}-alt-help`} className="media-dialog__hint">
                What it shows and why it is here, as you would tell it to someone on the phone. It
                is read out instead of the picture.
              </p>
              {touched && altProblem && (
                <p className="media-dialog__error" role="alert">
                  {altProblem}
                </p>
              )}
            </div>

            <div className="field">
              <label htmlFor={`${ids}-caption`}>Caption (optional)</label>
              <input
                id={`${ids}-caption`}
                type="text"
                maxLength={300}
                autoComplete="off"
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
              />
            </div>
          </>
        )}

        {(kind === 'embed' || kind === 'link') && (
          <div className="field">
            <label htmlFor={`${ids}-url`}>
              {kind === 'embed' ? 'Address of the video or calendar' : 'Address of the page'}
            </label>
            <input
              id={`${ids}-url`}
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://"
              value={url}
              aria-invalid={(touched && urlProblem !== null) || undefined}
              aria-describedby={`${ids}-url-status`}
              onChange={(event) => {
                setUrl(event.target.value);
                const found = kind === 'embed' ? parseEmbedUrl(event.target.value) : null;
                if (found && title.trim() === '') setTitle(defaultTitle(found.provider));
              }}
            />
            <p id={`${ids}-url-status`} className="media-dialog__status" aria-live="polite">
              {kind === 'embed' && recognised
                ? `${PROVIDERS[recognised.provider].name} ${PROVIDERS[recognised.provider].what} found.`
                : ''}
            </p>
            {touched && urlProblem && (
              <p className="media-dialog__error" role="alert">
                {urlProblem}
              </p>
            )}
          </div>
        )}

        {(kind === 'embed' || kind === 'link') && (
          <div className="field">
            <label htmlFor={`${ids}-title`}>{kind === 'embed' ? 'Name' : 'Title (optional)'}</label>
            <input
              id={`${ids}-title`}
              type="text"
              maxLength={100}
              autoComplete="off"
              value={title}
              aria-required={kind === 'embed' || undefined}
              aria-invalid={(touched && titleProblem !== null) || undefined}
              onChange={(event) => setTitle(event.target.value)}
            />
            {touched && titleProblem && (
              <p className="media-dialog__error" role="alert">
                {titleProblem}
              </p>
            )}
          </div>
        )}

        {kind === 'embed' && (
          <p className="media-dialog__privacy">
            Nothing is loaded from the provider when this is added. It is only requested when
            someone presses play, and the placeholder tells them who would receive their address.
          </p>
        )}
        {kind === 'link' && (
          <p className="media-dialog__privacy">
            Nothing is fetched from the page, so adding a link sends nobody&apos;s address anywhere.
          </p>
        )}

        <div className="media-dialog__field">
          <span className="media-dialog__label">Width</span>
          <Segmented<BlockSize> label="Width" value={size} options={SIZES} onChange={setSize} />
        </div>

        <div className="media-dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Adding…' : 'Add'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
