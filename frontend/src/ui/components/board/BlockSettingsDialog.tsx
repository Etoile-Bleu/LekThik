import { type FormEvent, useEffect, useId, useState } from 'react';

import {
  DEFAULT_AGENDA,
  KIND_LABEL,
  agendaConfig,
  calendarConfig,
  counterConfig,
  isCardList,
  noteConfig,
} from '@lib/blocks';
import type {
  AgendaRange,
  BlockSize,
  BoardList,
  CounterConfig,
  CounterMetric,
  PanelConfig,
} from '@lib/boardsApi';

import { Dialog } from '../ui/Dialog';
import { Segmented } from '../ui/Segmented';
import { Switch } from '../ui/Switch';
import './BlockSettingsDialog.css';

interface BlockSettingsDialogProps {
  block: BoardList | null;
  /** Every panel of the board, to choose the list that means done. */
  panels: BoardList[];
  onSave: (blockId: string, kind: BoardList['kind'], config: PanelConfig) => void;
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
    default:
      return {};
  }
}

/** Settings of one block. The title is edited on the block itself, as for a list. */
export function BlockSettingsDialog({ block, panels, onSave, onClose }: BlockSettingsDialogProps) {
  const [draft, setDraft] = useState<PanelConfig>({});
  const labelId = useId();
  const metricId = useId();
  const listId = useId();
  const dateId = useId();

  useEffect(() => {
    if (block) setDraft(initial(block));
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
  const missing =
    (needsList && !counter.done_list_id) || (needsDate && !counter.date)
      ? needsList
        ? 'Choose the list that means done.'
        : 'Choose the date to count down to.'
      : null;

  function update(changes: Partial<PanelConfig>) {
    setDraft((current) => ({ ...current, ...changes }) as PanelConfig);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!block || missing) return;
    onSave(block.id, block.kind, draft);
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

        {missing && (
          <p className="block-settings__error" role="alert">
            {missing}
          </p>
        )}

        <div className="block-settings__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={missing !== null}>
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}
