import { type FormEvent, useEffect, useState } from 'react';

import { PRIORITY_LABELS } from '@lib/boardModel';
import {
  LABEL_COLORS,
  type Label,
  type LabelColor,
  PRIORITIES,
  type Priority,
} from '@lib/boardsApi';
import { useBoardStore } from '@lib/boardStore';

import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Dialog } from '../ui/Dialog';
import { CheckIcon, PencilIcon, TrashIcon } from '../ui/Icons';
import { LabelChip, PriorityBars } from './LabelChip';
import './LabelsDialog.css';

interface LabelsDialogProps {
  open: boolean;
  onClose: () => void;
}

const COLOR_NAMES: Record<LabelColor, string> = {
  slate: 'Slate',
  red: 'Red',
  orange: 'Orange',
  amber: 'Amber',
  green: 'Green',
  teal: 'Teal',
  blue: 'Blue',
  violet: 'Violet',
  pink: 'Pink',
};

const PRIORITY_NAMES: Record<Priority, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export function LabelsDialog({ open, onClose }: LabelsDialogProps) {
  const labels = useBoardStore((state) => state.view?.labels ?? []);
  const createLabel = useBoardStore((state) => state.createLabel);
  const updateLabel = useBoardStore((state) => state.updateLabel);
  const deleteLabel = useBoardStore((state) => state.deleteLabel);

  const [editing, setEditing] = useState<Label | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState<LabelColor>('blue');
  const [priority, setPriority] = useState<Priority>('medium');
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Label | null>(null);

  useEffect(() => {
    if (!open) {
      setEditing(null);
      setName('');
      setColor('blue');
      setPriority('medium');
    }
  }, [open]);

  function startEditing(label: Label) {
    setEditing(label);
    setName(label.name);
    setColor(label.color);
    setPriority(label.priority);
  }

  function resetForm() {
    setEditing(null);
    setName('');
    setColor('blue');
    setPriority('medium');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) {
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await updateLabel(editing.id, { name: trimmed, color, priority });
      } else {
        await createLabel({ name: trimmed, color, priority });
      }
      resetForm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} title="Labels" size="md">
        <div className="labels-dialog">
          <header>
            <h2 className="labels-dialog__title">Labels</h2>
            <p className="labels-dialog__intro">
              Give a label a priority to triage cards at a glance. A board holds up to 30 labels.
            </p>
          </header>

          <ul className="labels-dialog__list">
            {labels.map((label) => (
              <li key={label.id} className="labels-dialog__row">
                <div className="labels-dialog__chip">
                  <LabelChip name={label.name} color={label.color} priority={label.priority} />
                  <span className="labels-dialog__priority">{PRIORITY_LABELS[label.priority]}</span>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Edit label ${label.name}`}
                  onClick={() => startEditing(label)}
                >
                  <PencilIcon />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Delete label ${label.name}`}
                  onClick={() => setPendingDelete(label)}
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
            {labels.length === 0 && (
              <li className="labels-dialog__empty">No labels yet. Create the first one below.</li>
            )}
          </ul>

          <form className="labels-dialog__form" onSubmit={handleSubmit}>
            <h3 className="labels-dialog__subtitle">{editing ? 'Edit label' : 'New label'}</h3>

            <div className="field">
              <label htmlFor="label-name">Name</label>
              <input
                id="label-name"
                type="text"
                value={name}
                maxLength={40}
                autoComplete="off"
                placeholder="Blocked, Quick win…"
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <fieldset className="labels-dialog__group">
              <legend className="field-label">Color</legend>
              <div className="labels-dialog__swatches">
                {LABEL_COLORS.map((option) => (
                  <label key={option} className={`swatch swatch--${option}`}>
                    <input
                      type="radio"
                      name="label-color"
                      value={option}
                      checked={color === option}
                      onChange={() => setColor(option)}
                    />
                    <span className="swatch__dot">
                      {color === option && <CheckIcon size={14} />}
                    </span>
                    <span className="sr-only">{COLOR_NAMES[option]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="labels-dialog__group">
              <legend className="field-label">Priority</legend>
              <div className="labels-dialog__segments">
                {PRIORITIES.map((option) => (
                  <label key={option} className="segment">
                    <input
                      type="radio"
                      name="label-priority"
                      value={option}
                      checked={priority === option}
                      onChange={() => setPriority(option)}
                    />
                    <span className="segment__face">
                      <PriorityBars priority={option} />
                      {PRIORITY_NAMES[option]}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="labels-dialog__preview" aria-hidden="true">
              <span>Preview</span>
              <LabelChip
                name={name.trim() || 'Label name'}
                color={color}
                priority={priority}
                showPriorityText={false}
              />
            </div>

            <div className="labels-dialog__actions">
              {editing && (
                <button type="button" className="btn btn--ghost" onClick={resetForm}>
                  Cancel
                </button>
              )}
              <button type="submit" className="btn btn--primary" disabled={busy || !name.trim()}>
                {editing ? 'Save label' : 'Create label'}
              </button>
            </div>
          </form>
        </div>
      </Dialog>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this label?"
        message={
          pendingDelete
            ? `“${pendingDelete.name}” will be removed from every card that carries it.`
            : ''
        }
        confirmLabel="Delete label"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            void deleteLabel(pendingDelete.id);
            if (editing?.id === pendingDelete.id) {
              resetForm();
            }
          }
          setPendingDelete(null);
        }}
      />
    </>
  );
}
