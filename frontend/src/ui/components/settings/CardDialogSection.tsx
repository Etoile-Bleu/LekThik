import type { ReactElement } from 'react';

import { useFlip } from '@hooks/useFlip';
import { announce } from '@lib/announcer';
import { type CardProperty, DEFAULT_CARD_DIALOG, normalizeDialogLayout } from '@lib/prefs';
import { usePrefsStore } from '@lib/prefsStore';

import { LabelChip } from '../board/LabelChip';
import { Avatar } from '../collab/Avatar';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarIcon,
  TagIcon,
  TextLinesIcon,
  UsersIcon,
} from '../ui/Icons';
import { PropertyRow } from '../ui/PropertyRow';
import { Switch } from '../ui/Switch';
import './CardDialogSection.css';

const PROPERTIES: Record<CardProperty, { label: string; hint: string; icon: ReactElement }> = {
  assignees: {
    label: 'Assignees',
    hint: 'Who is on the card.',
    icon: <UsersIcon size={16} />,
  },
  due_date: {
    label: 'Due date',
    hint: 'The day it is due.',
    icon: <CalendarIcon size={16} />,
  },
  labels: { label: 'Labels', hint: 'Tags and priority.', icon: <TagIcon size={16} /> },
  list: {
    label: 'List',
    hint: 'Where the card sits, and a way to move it.',
    icon: <TextLinesIcon size={16} />,
  },
};

function SampleValue({ property }: { property: CardProperty }) {
  switch (property) {
    case 'assignees':
      return (
        <span className="card-layout__people">
          <Avatar name="Amir" seed="amir" size="xs" />
          <Avatar name="Wen" seed="wen" size="xs" />
        </span>
      );
    case 'due_date':
      return <span className="card-layout__pill">Tomorrow</span>;
    case 'labels':
      return (
        <span className="card-layout__chips">
          <LabelChip name="Urgent" color="red" priority="urgent" />
          <LabelChip name="Design" color="violet" priority="none" />
        </span>
      );
    case 'list':
      return <span className="card-layout__pill">In production</span>;
  }
}

/**
 * Which properties the card dialog shows and in what order. Move buttons and
 * switches rather than dragging: keyboard and touch work the same, and each
 * change is announced. The preview shows the dialog as it will be.
 */
export function CardDialogSection() {
  const stored = usePrefsStore((state) => state.prefs.card_dialog);
  const setCardDialog = usePrefsStore((state) => state.setCardDialog);

  const layout = normalizeDialogLayout(stored);
  const listRef = useFlip<HTMLOListElement>(layout.order.join());
  const previewRef = useFlip<HTMLDivElement>(layout.order.join());
  const shown = layout.order.filter((property) => !layout.hidden.includes(property));
  const isDefault =
    layout.order.join() === DEFAULT_CARD_DIALOG.order.join() && layout.hidden.length === 0;

  function move(property: CardProperty, by: -1 | 1) {
    const from = layout.order.indexOf(property);
    const to = from + by;
    if (to < 0 || to >= layout.order.length) return;
    const order = [...layout.order];
    order.splice(from, 1);
    order.splice(to, 0, property);
    setCardDialog({ ...layout, order });
    announce(
      `${PROPERTIES[property].label} moved ${by < 0 ? 'up' : 'down'}, position ${to + 1} of ${order.length}.`
    );
  }

  function show(property: CardProperty, visible: boolean) {
    setCardDialog({
      ...layout,
      hidden: visible
        ? layout.hidden.filter((hidden) => hidden !== property)
        : [...layout.hidden, property],
    });
    announce(`${PROPERTIES[property].label} ${visible ? 'shown' : 'hidden'}.`);
  }

  return (
    <div className="card-layout">
      <p className="card-layout__lead">
        Choose what a card shows when you open it, and in what order. It applies to every board. A
        hidden property is still one click away under the others.
      </p>

      <div className="card-layout__grid">
        <section aria-labelledby="card-layout-order">
          <h3 id="card-layout-order" className="card-layout__heading">
            Properties
          </h3>
          <ol className="card-layout__list" ref={listRef}>
            {layout.order.map((property, index) => {
              const meta = PROPERTIES[property];
              const hidden = layout.hidden.includes(property);
              return (
                <li
                  key={property}
                  className="card-layout__row"
                  data-flip={property}
                  data-hidden={hidden || undefined}
                >
                  <span className="card-layout__grip" aria-hidden="true">
                    {meta.icon}
                  </span>
                  <div className="card-layout__switch">
                    <Switch
                      label={meta.label}
                      hint={meta.hint}
                      checked={!hidden}
                      onChange={(visible) => show(property, visible)}
                    />
                  </div>
                  <div
                    className="card-layout__moves"
                    role="group"
                    aria-label={`Move ${meta.label}`}
                  >
                    <button
                      type="button"
                      className="card-layout__move"
                      aria-label={`Move ${meta.label} up`}
                      disabled={index === 0}
                      onClick={() => move(property, -1)}
                    >
                      <ArrowUpIcon size={16} />
                    </button>
                    <button
                      type="button"
                      className="card-layout__move"
                      aria-label={`Move ${meta.label} down`}
                      disabled={index === layout.order.length - 1}
                      onClick={() => move(property, 1)}
                    >
                      <ArrowDownIcon size={16} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
          <button
            type="button"
            className="btn btn--ghost btn--sm card-layout__reset"
            disabled={isDefault}
            onClick={() => {
              setCardDialog(DEFAULT_CARD_DIALOG);
              announce('Card layout reset.');
            }}
          >
            Reset the layout
          </button>
        </section>

        <section aria-labelledby="card-layout-preview">
          <h3 id="card-layout-preview" className="card-layout__heading">
            Preview
          </h3>
          <div className="card-layout__preview" ref={previewRef}>
            {shown.length === 0 && (
              <p className="card-layout__empty">
                Nothing shown. The title and description always stay.
              </p>
            )}
            {shown.map((property) => (
              <div key={property} data-flip={property}>
                <PropertyRow icon={PROPERTIES[property].icon} label={PROPERTIES[property].label}>
                  <SampleValue property={property} />
                </PropertyRow>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
