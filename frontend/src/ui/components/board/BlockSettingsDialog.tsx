import { type FormEvent, useEffect, useId, useRef, useState } from 'react';

import {
  DEFAULT_AGENDA,
  KIND_LABEL,
  agendaConfig,
  calendarConfig,
  counterConfig,
  embedConfig,
  imageConfig,
  isCardList,
  linkConfig,
  noteConfig,
  progressConfig,
} from '@lib/blocks';
import type {
  AgendaRange,
  BlockSize,
  BoardList,
  CounterConfig,
  CounterMetric,
  EmbedConfig,
  ImageConfig,
  LinkConfig,
  PanelConfig,
  ProgressConfig,
  ProgressStyle,
} from '@lib/boardsApi';
import { parseEmbedUrl } from '@lib/embeds';
import { PICTURE_TYPES, checkPicture, checkWebAddress } from '@lib/media';

import { Dialog } from '../ui/Dialog';
import { UploadIcon } from '../ui/Icons';
import { Segmented } from '../ui/Segmented';
import { Switch } from '../ui/Switch';
import './BlockSettingsDialog.css';

interface BlockSettingsDialogProps {
  block: BoardList | null;
  /** Every panel of the board, to choose the list that means done. */
  panels: BoardList[];
  onSave: (blockId: string, kind: BoardList['kind'], config: PanelConfig) => void;
  /** Puts a new picture in an image block. Resolves true when it worked. */
  onReplacePicture?: (blockId: string, file: File) => Promise<boolean>;
  onClose: () => void;
}

const SIZES: Array<{ value: BlockSize; label: string }> = [
  { value: 'normal', label: 'Normal' },
  { value: 'wide', label: 'Wide' },
];

const RANGES: Array<{ value: AgendaRange; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Next 7 days' },
];

const PROGRESS_STYLES: Array<{ value: ProgressStyle; label: string }> = [
  { value: 'ring', label: 'Ring' },
  { value: 'bar', label: 'Bar' },
];

const METRICS: Array<{ value: CounterMetric; label: string; hint: string }> = [
  { value: 'overdue', label: 'Overdue cards', hint: 'How many are past their due date.' },
  { value: 'done_percent', label: 'Share done', hint: 'Cards in the list that means done.' },
  { value: 'days_left', label: 'Days left', hint: 'Days until a date you choose.' },
  { value: 'total_cards', label: 'All cards', hint: 'How many cards are on the board.' },
];

function initial(block: BoardList): PanelConfig {
  switch (block.kind) {
    case 'calendar':
      return calendarConfig(block);
    case 'agenda':
      return agendaConfig(block);
    case 'note':
      return noteConfig(block);
    case 'counter':
      return counterConfig(block);
    case 'progress':
      return progressConfig(block);
    case 'image':
      return imageConfig(block);
    case 'link':
      return linkConfig(block);
    case 'embed':
      return embedConfig(block) ?? { size: 'wide', provider: 'youtube', id: '', title: '' };
    default:
      return {};
  }
}

/** Settings of one block. The title is edited on the block itself, as for a list. */
export function BlockSettingsDialog({
  block,
  panels,
  onSave,
  onReplacePicture,
  onClose,
}: BlockSettingsDialogProps) {
  const [draft, setDraft] = useState<PanelConfig>({});
  const [address, setAddress] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const mediaId = useId();
  const labelId = useId();
  const metricId = useId();
  const listId = useId();
  const dateId = useId();

  useEffect(() => {
    if (block) {
      setDraft(initial(block));
      setAddress('');
      setFile(null);
      setBusy(false);
    }
  }, [block]);

  if (!block) {
    return (
      <Dialog open={false} onClose={onClose} title="Block settings" size="sm">
        <div />
      </Dialog>
    );
  }

  const lists = panels.filter(isCardList);
  const counter = draft as CounterConfig;
  const size = (draft as { size?: BlockSize }).size ?? 'normal';
  const needsList = block.kind === 'counter' && counter.metric === 'done_percent';
  const needsDate = block.kind === 'counter' && counter.metric === 'days_left';
  const progress = draft as ProgressConfig;
  const progressMissing = block.kind === 'progress' && !progress.done_list_id;
  const image = draft as ImageConfig;
  const embed = draft as EmbedConfig;
  const link = draft as LinkConfig;
  const mediaProblem =
    block.kind === 'image'
      ? image.alt?.trim()
        ? file
          ? checkPicture(file)
          : null
        : 'Describe the picture.'
      : block.kind === 'embed'
        ? embed.title?.trim()
          ? address.trim() !== '' && !parseEmbedUrl(address)
            ? 'Only YouTube, Vimeo and Google Calendar addresses can be used.'
            : null
          : 'Name it, for people who cannot see it.'
        : block.kind === 'link'
          ? checkWebAddress(link.url ?? '')
          : null;
  const missing =
    (needsList && !counter.done_list_id) || (needsDate && !counter.date) || progressMissing
      ? needsList || progressMissing
        ? 'Choose the list that means done.'
        : 'Choose the date to count down to.'
      : mediaProblem;

  function update(changes: Partial<PanelConfig>) {
    setDraft((current) => ({ ...current, ...changes }) as PanelConfig);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!block || missing) return;

    if (block.kind === 'image' && file && onReplacePicture) {
      setBusy(true);
      const done = await onReplacePicture(block.id, file);
      setBusy(false);
      if (!done) return;
    }

    let config = draft;
    if (block.kind === 'embed') {
      // A new address is recognised by the server, otherwise what was stored is kept as it is.
      config =
        address.trim() !== ''
          ? { size: embed.size, title: embed.title.trim(), url: address.trim() }
          : { size: embed.size, provider: embed.provider, id: embed.id, title: embed.title.trim() };
    }
    onSave(block.id, block.kind, config);
    onClose();
  }

  return (
    <Dialog open onClose={onClose} title={`${KIND_LABEL[block.kind]} settings`} size="sm">
      <form className="block-settings" onSubmit={submit} noValidate>
        <h2 className="block-settings__title">{KIND_LABEL[block.kind]} settings</h2>
        <p className="block-settings__lead">
          For <strong>{block.name}</strong>. Rename it from its title on the board.
        </p>

        <div className="block-settings__field">
          <span className="block-settings__label">Width</span>
          <Segmented<BlockSize>
            label="Width"
            value={size}
            options={SIZES}
            onChange={(next) => update({ size: next })}
          />
        </div>

        {block.kind === 'agenda' && (
          <>
            <div className="block-settings__field">
              <span className="block-settings__label">Looks at</span>
              <Segmented<AgendaRange>
                label="Looks at"
                value={(draft as { range?: AgendaRange }).range ?? DEFAULT_AGENDA.range}
                options={RANGES}
                onChange={(range) => update({ range })}
              />
            </div>
            <Switch
              label="Only my cards"
              hint="Leaves out the cards assigned to other people or to nobody."
              checked={Boolean((draft as { mine_only?: boolean }).mine_only)}
              onChange={(mine_only) => update({ mine_only })}
            />
          </>
        )}

        {block.kind === 'counter' && (
          <>
            <div className="field">
              <label htmlFor={metricId}>What to count</label>
              <select
                id={metricId}
                value={counter.metric}
                onChange={(event) => update({ metric: event.target.value as CounterMetric })}
              >
                {METRICS.map((metric) => (
                  <option key={metric.value} value={metric.value}>
                    {metric.label}
                  </option>
                ))}
              </select>
              <p className="block-settings__hint">
                {METRICS.find((metric) => metric.value === counter.metric)?.hint}
              </p>
            </div>

            {needsList && (
              <div className="field">
                <label htmlFor={listId}>The list that means done</label>
                <select
                  id={listId}
                  value={counter.done_list_id ?? ''}
                  aria-invalid={!counter.done_list_id || undefined}
                  onChange={(event) => update({ done_list_id: event.target.value || null })}
                >
                  <option value="">Choose a list…</option>
                  {lists.map((list) => (
                    <option key={list.id} value={list.id}>
                      {list.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {needsDate && (
              <div className="field">
                <label htmlFor={dateId}>Count down to</label>
                <input
                  id={dateId}
                  type="date"
                  value={counter.date ?? ''}
                  aria-invalid={!counter.date || undefined}
                  onChange={(event) => update({ date: event.target.value || null })}
                />
              </div>
            )}

            <div className="field">
              <label htmlFor={labelId}>Name of the number (optional)</label>
              <input
                id={labelId}
                type="text"
                maxLength={60}
                value={counter.label}
                placeholder="Days to launch"
                autoComplete="off"
                onChange={(event) => update({ label: event.target.value })}
              />
            </div>
          </>
        )}

        {block.kind === 'progress' && (
          <>
            <div className="block-settings__field">
              <span className="block-settings__label">Shape</span>
              <Segmented<ProgressStyle>
                label="Shape"
                value={progress.style}
                options={PROGRESS_STYLES}
                onChange={(style) => update({ style })}
              />
            </div>
            <div className="field">
              <label htmlFor={listId}>The list that means done</label>
              <select
                id={listId}
                value={progress.done_list_id ?? ''}
                aria-invalid={progressMissing || undefined}
                onChange={(event) => update({ done_list_id: event.target.value || null })}
              >
                <option value="">Choose a list…</option>
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
              <p className="block-settings__hint">
                The ring shows the cards in this list out of all the cards of the board.
              </p>
            </div>
            <div className="field">
              <label htmlFor={labelId}>Name (optional)</label>
              <input
                id={labelId}
                type="text"
                maxLength={60}
                value={progress.label ?? ''}
                placeholder="Sprint 12"
                autoComplete="off"
                onChange={(event) => update({ label: event.target.value })}
              />
            </div>
          </>
        )}

        {block.kind === 'image' && (
          <>
            <div className="field">
              <label htmlFor={`${mediaId}-alt`}>Description of the picture</label>
              <textarea
                id={`${mediaId}-alt`}
                rows={3}
                maxLength={300}
                value={image.alt}
                aria-required="true"
                onChange={(event) => update({ alt: event.target.value })}
              />
              <p className="block-settings__hint">It is read out instead of the picture.</p>
            </div>
            <div className="field">
              <label htmlFor={`${mediaId}-caption`}>Caption (optional)</label>
              <input
                id={`${mediaId}-caption`}
                type="text"
                maxLength={300}
                autoComplete="off"
                value={image.caption}
                onChange={(event) => update({ caption: event.target.value })}
              />
            </div>
            {onReplacePicture && (
              <div className="block-settings__field">
                <span className="block-settings__label">
                  {block.image_version ? 'Replace the picture' : 'Add the picture'}
                </span>
                <div className="block-settings__picker">
                  <button
                    type="button"
                    className="btn btn--outline btn--sm"
                    onClick={() => fileInput.current?.click()}
                  >
                    <UploadIcon size={15} /> Choose a picture
                  </button>
                  <span className="block-settings__hint">
                    {file ? file.name : 'PNG, JPEG or WebP, up to 5 MB.'}
                  </span>
                  <input
                    ref={fileInput}
                    type="file"
                    className="sr-only"
                    tabIndex={-1}
                    aria-label="Picture file"
                    accept={PICTURE_TYPES.join(',')}
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
            )}
          </>
        )}

        {block.kind === 'embed' && (
          <>
            <div className="field">
              <label htmlFor={`${mediaId}-title`}>Name</label>
              <input
                id={`${mediaId}-title`}
                type="text"
                maxLength={100}
                autoComplete="off"
                value={embed.title}
                aria-required="true"
                onChange={(event) => update({ title: event.target.value })}
              />
              <p className="block-settings__hint">It names the frame for screen readers.</p>
            </div>
            <div className="field">
              <label htmlFor={`${mediaId}-address`}>Show something else (optional)</label>
              <input
                id={`${mediaId}-address`}
                type="text"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste a new address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
            </div>
          </>
        )}

        {block.kind === 'link' && (
          <>
            <div className="field">
              <label htmlFor={`${mediaId}-url`}>Address</label>
              <input
                id={`${mediaId}-url`}
                type="text"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                value={link.url}
                aria-required="true"
                onChange={(event) => update({ url: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor={`${mediaId}-ltitle`}>Title (optional)</label>
              <input
                id={`${mediaId}-ltitle`}
                type="text"
                maxLength={100}
                autoComplete="off"
                value={link.title}
                onChange={(event) => update({ title: event.target.value })}
              />
            </div>
          </>
        )}

        {missing && (
          <p className="block-settings__error" role="alert">
            {missing}
          </p>
        )}

        <div className="block-settings__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={missing !== null || busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
