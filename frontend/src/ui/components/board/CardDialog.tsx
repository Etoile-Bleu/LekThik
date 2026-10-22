import { useCallback, useEffect, useRef, useState } from 'react';

import { findCard } from '@lib/boardModel';
import { type CardDetail, fetchCard, updateCard } from '@lib/boardsApi';
import { useBoardStore } from '@lib/boardStore';
import { notifyError } from '@lib/toastStore';

import { canEdit } from '@lib/roles';

import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Dialog } from '../ui/Dialog';
import { CalendarIcon, TagIcon, TextLinesIcon, TrashIcon, UsersIcon } from '../ui/Icons';
import { InlineEdit } from '../ui/InlineEdit';
import { AssigneePicker } from './AssigneePicker';
import { DueDateField } from './DueDateField';
import { Pick } from '../ui/Pick';
import { PropertyRow } from '../ui/PropertyRow';
import { LabelChip } from './LabelChip';
import './CardDialog.css';

interface CardDialogProps {
  cardId: string | null;
  onClose: () => void;
  onManageLabels: () => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved';

export function CardDialog({ cardId, onClose, onManageLabels }: CardDialogProps) {
  const view = useBoardStore((state) => state.view);
  const renameCard = useBoardStore((state) => state.renameCard);
  const moveCard = useBoardStore((state) => state.moveCard);
  const deleteCard = useBoardStore((state) => state.deleteCard);
  const setCardLabels = useBoardStore((state) => state.setCardLabels);
  const setCardAssignees = useBoardStore((state) => state.setCardAssignees);
  const setCardDueDate = useBoardStore((state) => state.setCardDueDate);
  const markHasDescription = useBoardStore((state) => state.markHasDescription);

  const [detail, setDetail] = useState<CardDetail | null>(null);
  const [description, setDescription] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [targetListId, setTargetListId] = useState('');
  const [targetPosition, setTargetPosition] = useState(1);
  const descriptionRef = useRef('');
  const detailRef = useRef<CardDetail | null>(null);

  const editable = canEdit(view?.role);
  const location = view && cardId ? findCard(view.lists, cardId) : null;
  const summary =
    view && location ? view.lists[location.listIndex].cards[location.cardIndex] : null;
  const currentList = view && location ? view.lists[location.listIndex] : null;

  useEffect(() => {
    setDetail(null);
    detailRef.current = null;
    setSaveStatus('idle');
    if (!cardId) {
      return undefined;
    }

    let cancelled = false;
    fetchCard(cardId)
      .then((loaded) => {
        if (cancelled) return;
        setDetail(loaded);
        detailRef.current = loaded;
        setDescription(loaded.description);
        descriptionRef.current = loaded.description;
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        notifyError(error, 'Could not open this card.');
        onClose();
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  useEffect(() => {
    if (currentList && location) {
      setTargetListId(currentList.id);
      setTargetPosition(location.cardIndex + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, currentList?.id, location?.cardIndex]);

  const saveDescription = useCallback(async () => {
    const loaded = detailRef.current;
    const next = descriptionRef.current;
    if (!loaded || next === loaded.description) {
      return;
    }
    setSaveStatus('saving');
    try {
      const saved = await updateCard(loaded.id, { description: next });
      detailRef.current = saved;
      setDetail(saved);
      markHasDescription(saved.id, saved.description.trim() !== '');
      setSaveStatus('saved');
    } catch (error) {
      notifyError(error, 'Could not save the description.');
      setSaveStatus('idle');
    }
  }, [markHasDescription]);

  function requestClose() {
    void saveDescription();
    onClose();
  }

  if (!view || !summary || !currentList) {
    return null;
  }

  const positionCount =
    targetListId === currentList.id
      ? currentList.cards.length
      : (view.lists.find((list) => list.id === targetListId)?.cards.length ?? 0) + 1;
  const hasMoved = targetListId !== currentList.id || targetPosition - 1 !== location?.cardIndex;

  function toggleLabel(labelId: string, checked: boolean) {
    if (!summary) return;
    const next = checked
      ? [...summary.label_ids, labelId]
      : summary.label_ids.filter((id) => id !== labelId);
    void setCardLabels(summary.id, next);
  }

  return (
    <>
      <Dialog
        open={cardId !== null}
        onClose={requestClose}
        title={`Card ${summary.title}`}
        size="lg"
      >
        <div className="card-dialog">
          <header className="card-dialog__header">
            <InlineEdit
              as="h2"
              className="card-dialog__title"
              value={summary.title}
              label="card title"
              readOnly={!editable}
              onCommit={(title) => void renameCard(summary.id, title)}
            />
            <p className="card-dialog__location">
              In list <strong>{currentList.name}</strong>
            </p>
          </header>

          <div className="card-dialog__props">
            <PropertyRow index={0} icon={<UsersIcon size={16} />} label="Assignees">
              <AssigneePicker
                members={view.members}
                assigneeIds={summary.assignee_ids}
                editable={editable}
                onChange={(userIds) => void setCardAssignees(summary.id, userIds)}
              />
            </PropertyRow>

            <PropertyRow index={1} icon={<CalendarIcon size={16} />} label="Due date">
              <DueDateField
                value={summary.due_date}
                editable={editable}
                onChange={(day) => void setCardDueDate(summary.id, day)}
              />
            </PropertyRow>

            <PropertyRow index={2} icon={<TagIcon size={16} />} label="Labels">
              {view.labels.length === 0 && <span className="card-dialog__none">No labels yet</span>}
              <ul className="card-dialog__label-list">
                {view.labels.map((label) => (
                  <li key={label.id}>
                    <Pick
                      bare
                      checked={summary.label_ids.includes(label.id)}
                      disabled={!editable}
                      onChange={(checked) => toggleLabel(label.id, checked)}
                    >
                      <LabelChip name={label.name} color={label.color} priority={label.priority} />
                    </Pick>
                  </li>
                ))}
              </ul>
              {editable && (
                <button type="button" className="card-dialog__link" onClick={onManageLabels}>
                  Manage labels
                </button>
              )}
            </PropertyRow>

            <PropertyRow index={3} icon={<TextLinesIcon size={16} />} label="List">
              {editable ? (
                <>
                  <select
                    className="card-dialog__select"
                    aria-label="List"
                    value={targetListId}
                    onChange={(event) => {
                      setTargetListId(event.target.value);
                      const target = view.lists.find((list) => list.id === event.target.value);
                      setTargetPosition(
                        (target?.cards.length ?? 0) +
                          (event.target.value === currentList.id ? 0 : 1)
                      );
                    }}
                  >
                    {view.lists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name}
                      </option>
                    ))}
                  </select>
                  <label className="card-dialog__position">
                    <span>Position</span>
                    <select
                      className="card-dialog__select card-dialog__select--short"
                      aria-label="Position"
                      value={targetPosition}
                      onChange={(event) => setTargetPosition(Number(event.target.value))}
                    >
                      {Array.from({ length: Math.max(positionCount, 1) }, (_, index) => (
                        <option key={index} value={index + 1}>
                          {index + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn btn--outline btn--sm"
                    disabled={!hasMoved}
                    onClick={() => void moveCard(summary.id, targetListId, targetPosition - 1)}
                  >
                    Move card
                  </button>
                </>
              ) : (
                <span>{currentList.name}</span>
              )}
            </PropertyRow>
          </div>

          <section className="card-dialog__description">
            <div className="card-dialog__description-head">
              <label htmlFor="card-description">Description</label>
              <p className="card-dialog__status" role="status" aria-live="polite">
                {saveStatus === 'saving' && 'Saving…'}
                {saveStatus === 'saved' && 'Saved'}
              </p>
            </div>
            <textarea
              id="card-description"
              value={description}
              disabled={!detail}
              readOnly={!editable}
              placeholder={
                !detail
                  ? 'Loading…'
                  : editable
                    ? 'Add more detail about this card…'
                    : 'No description.'
              }
              maxLength={10000}
              onChange={(event) => {
                setDescription(event.target.value);
                descriptionRef.current = event.target.value;
                setSaveStatus('idle');
              }}
              onBlur={() => void saveDescription()}
            />
          </section>

          {editable && (
            <footer className="card-dialog__footer">
              <button
                type="button"
                className="btn btn--ghost btn--sm card-dialog__delete"
                onClick={() => setConfirmingDelete(true)}
              >
                <TrashIcon /> Delete card
              </button>
            </footer>
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this card?"
        message={`“${summary.title}” will be removed for good. This cannot be undone.`}
        confirmLabel="Delete card"
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => {
          setConfirmingDelete(false);
          onClose();
          void deleteCard(summary.id);
        }}
      />
    </>
  );
}
