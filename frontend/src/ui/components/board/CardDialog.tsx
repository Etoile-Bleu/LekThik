import { Fragment, useCallback, useEffect, useRef, useState } from 'react';

import { useAuthStore } from '@lib/authStore';
import { isCardList } from '@lib/blocks';
import { toggleTask } from '@lib/richText';
import { findCard } from '@lib/boardModel';
import { indexValues } from '@lib/fields';
import { type CardDetail, fetchCard, updateCard } from '@lib/boardsApi';
import { useBoardStore } from '@lib/boardStore';
import { notifyError } from '@lib/toastStore';

import { type CardProperty, normalizeDialogLayout } from '@lib/prefs';
import { usePrefsStore } from '@lib/prefsStore';
import { canEdit, canManage } from '@lib/roles';

import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Dialog } from '../ui/Dialog';
import {
  CalendarIcon,
  ChevronDownIcon,
  PencilIcon,
  SlidersIcon,
  TagIcon,
  TextLinesIcon,
  TrashIcon,
  UsersIcon,
} from '../ui/Icons';
import { RichEditor } from '../richtext/RichEditor';
import { RichText } from '../richtext/RichText';
import { InlineEdit } from '../ui/InlineEdit';
import { AssigneePicker } from './AssigneePicker';
import { CardFields } from './CardFields';
import { CardTimeline } from './CardTimeline';
import { DueDateField } from './DueDateField';
import { Pick } from '../ui/Pick';
import { PropertyRow } from '../ui/PropertyRow';
import { LabelChip } from './LabelChip';
import './CardDialog.css';

interface CardDialogProps {
  cardId: string | null;
  onClose: () => void;
  onManageLabels: () => void;
  /** Opens the settings where the properties are ordered and hidden. */
  onCustomize?: () => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved';

export function CardDialog({ cardId, onClose, onManageLabels, onCustomize }: CardDialogProps) {
  const cardDialog = usePrefsStore((state) => state.prefs.card_dialog);
  const [showHidden, setShowHidden] = useState(false);
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
  const [saves, setSaves] = useState(0);
  const meId = useAuthStore((state) => state.user?.id);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [targetListId, setTargetListId] = useState('');
  const [targetPosition, setTargetPosition] = useState(1);
  const [editingDescription, setEditingDescription] = useState(false);
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
    setEditingDescription(false);
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
      setSaves((count) => count + 1);
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

  const layout = normalizeDialogLayout(cardDialog);
  const visibleProperties = layout.order.filter((property) => !layout.hidden.includes(property));
  const hiddenProperties = layout.order.filter((property) => layout.hidden.includes(property));
  const shown = showHidden ? [...visibleProperties, ...hiddenProperties] : visibleProperties;

  const renderProperty = (property: CardProperty, position: number) => {
    switch (property) {
      case 'assignees':
        return (
          <PropertyRow index={position} icon={<UsersIcon size={16} />} label="Assignees">
            <AssigneePicker
              members={view.members}
              assigneeIds={summary.assignee_ids}
              editable={editable}
              onChange={(userIds) => void setCardAssignees(summary.id, userIds)}
            />
          </PropertyRow>
        );
      case 'due_date':
        return (
          <PropertyRow index={position} icon={<CalendarIcon size={16} />} label="Due date">
            <DueDateField
              value={summary.due_date}
              editable={editable}
              onChange={(day) => void setCardDueDate(summary.id, day)}
            />
          </PropertyRow>
        );
      case 'labels':
        return (
          <PropertyRow index={position} icon={<TagIcon size={16} />} label="Labels">
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
        );
      case 'list':
        return (
          <PropertyRow index={position} icon={<TextLinesIcon size={16} />} label="List">
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
                      (target?.cards.length ?? 0) + (event.target.value === currentList.id ? 0 : 1)
                    );
                  }}
                >
                  {view.lists.filter(isCardList).map((list) => (
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
        );
    }
  };

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
            {shown.map((property, position) => (
              <Fragment key={property}>{renderProperty(property, position)}</Fragment>
            ))}
            {(view.fields ?? []).length > 0 && (
              <CardFields
                cardId={summary.id}
                fields={view.fields ?? []}
                values={indexValues(view.field_values).get(summary.id) ?? new Map()}
                editable={editable}
                startIndex={shown.length}
              />
            )}
          </div>

          {hiddenProperties.length > 0 && (
            <button
              type="button"
              className="card-dialog__more"
              aria-expanded={showHidden}
              onClick={() => setShowHidden((current) => !current)}
            >
              <ChevronDownIcon size={14} />
              {showHidden
                ? 'Hide the other properties'
                : `${hiddenProperties.length} hidden propert${hiddenProperties.length === 1 ? 'y' : 'ies'}`}
            </button>
          )}

          <section className="card-dialog__description" aria-labelledby="card-description-title">
            <div className="card-dialog__description-head">
              <h3 id="card-description-title" className="card-dialog__description-title">
                Description
              </h3>
              <p className="card-dialog__status" role="status" aria-live="polite">
                {saveStatus === 'saving' && 'Saving…'}
                {saveStatus === 'saved' && 'Saved'}
              </p>
            </div>

            {!detail && <p className="card-dialog__none">Loading…</p>}

            {detail && editingDescription && editable && (
              <RichEditor
                value={description}
                onChange={(next) => {
                  setDescription(next);
                  descriptionRef.current = next;
                  setSaveStatus('idle');
                }}
                onSave={() => {
                  setEditingDescription(false);
                  void saveDescription();
                }}
                onCancel={() => {
                  setDescription(detail.description);
                  descriptionRef.current = detail.description;
                  setEditingDescription(false);
                }}
                onLeave={() => {
                  setEditingDescription(false);
                  void saveDescription();
                }}
                label="Description"
                maxLength={10000}
                placeholder="Add more detail about this card. Markdown, checklists, tables, formulas and diagrams work."
              />
            )}

            {detail && !(editingDescription && editable) && (
              <>
                {description.trim() === '' ? (
                  <p className="card-dialog__none">
                    {editable ? 'No description yet.' : 'No description.'}
                  </p>
                ) : (
                  <RichText
                    text={description}
                    onToggleTask={
                      editable
                        ? (index) => {
                            const next = toggleTask(description, index);
                            setDescription(next);
                            descriptionRef.current = next;
                            void saveDescription();
                          }
                        : undefined
                    }
                  />
                )}
                {editable && (
                  <button
                    type="button"
                    className="card-dialog__edit"
                    onClick={() => setEditingDescription(true)}
                  >
                    <PencilIcon size={14} />
                    {description.trim() === '' ? 'Add a description' : 'Edit description'}
                  </button>
                )}
              </>
            )}
          </section>

          <CardTimeline
            key={summary.id}
            cardId={summary.id}
            signature={[
              summary.title,
              summary.list_id,
              summary.due_date ?? '',
              summary.label_ids.join(','),
              summary.assignee_ids.join(','),
              summary.comment_count ?? 0,
              saves,
            ].join('|')}
            meId={meId}
            members={view.members}
            canComment={editable}
            canModerate={canManage(view.role)}
          />

          {(editable || onCustomize) && (
            <footer className="card-dialog__footer">
              {editable && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm card-dialog__delete"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <TrashIcon /> Delete card
                </button>
              )}
              {onCustomize && (
                <button
                  type="button"
                  className="btn btn--ghost btn--sm card-dialog__customize"
                  onClick={() => {
                    requestClose();
                    onCustomize();
                  }}
                >
                  <SlidersIcon size={15} /> Customise this layout
                </button>
              )}
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
