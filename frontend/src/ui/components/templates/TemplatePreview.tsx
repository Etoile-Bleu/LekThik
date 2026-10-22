import type { BoardTemplate, LabelColor, Priority, TemplateCard } from '@lib/boardsApi';

import { LabelChip } from '../board/LabelChip';
import './TemplatePreview.css';

const MAX_PREVIEW_CARDS = 3;

const DEFAULT_LABELS: { name: string; color: LabelColor; priority: Priority }[] = [
  { name: 'Urgent', color: 'red', priority: 'urgent' },
  { name: 'High', color: 'orange', priority: 'high' },
  { name: 'Medium', color: 'amber', priority: 'medium' },
  { name: 'Low', color: 'blue', priority: 'low' },
];

function cardLabels(card: TemplateCard, template: BoardTemplate) {
  return card.labels
    .map((name) => template.labels.find((label) => label.name === name))
    .filter((label): label is NonNullable<typeof label> => label !== undefined);
}

export function BoardPreview({ template }: { template: BoardTemplate }) {
  return (
    <div className="tpl-board">
      <ul className="tpl-board__lists">
        {template.lists.map((list) => (
          <li key={list.name} className="tpl-list">
            <p className="tpl-list__header">
              <span className="tpl-list__name">{list.name}</span>
              <span className="tpl-list__count">{list.cards.length}</span>
            </p>
            <ul className="tpl-list__cards">
              {list.cards.slice(0, MAX_PREVIEW_CARDS).map((card) => {
                const labels = cardLabels(card, template);
                return (
                  <li key={card.title} className="tpl-card">
                    <span className="tpl-card__title">{card.title}</span>
                    {labels.length > 0 && (
                      <span className="tpl-card__dots">
                        {labels.map((label) => (
                          <span
                            key={label.name}
                            className={`tpl-dot tpl-dot--${label.color}`}
                            aria-hidden="true"
                          />
                        ))}
                        <span className="sr-only">
                          Labels: {labels.map((label) => label.name).join(', ')}
                        </span>
                      </span>
                    )}
                  </li>
                );
              })}
              {list.cards.length > MAX_PREVIEW_CARDS && (
                <li className="tpl-list__more">+{list.cards.length - MAX_PREVIEW_CARDS} more</li>
              )}
              {list.cards.length === 0 && <li className="tpl-list__empty">No cards yet</li>}
            </ul>
          </li>
        ))}
      </ul>

      <div className="tpl-board__labels">
        <p className="tpl-board__labels-title">Labels</p>
        <ul>
          {template.labels.map((label) => (
            <li key={label.name}>
              <LabelChip name={label.name} color={label.color} priority={label.priority} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function BoardOutline({ template }: { template: BoardTemplate }) {
  return (
    <ul className="tpl-outline">
      {template.lists.map((list) => (
        <li key={list.name}>
          {list.name}
          <span className="tpl-outline__count">{list.cards.length}</span>
        </li>
      ))}
    </ul>
  );
}

export function BlankBoardPreview() {
  return (
    <div className="tpl-blank">
      <p>
        An empty board. You add the lists you need, and it comes with four priority labels to get
        you started.
      </p>
      <ul className="tpl-blank__labels">
        {DEFAULT_LABELS.map((label) => (
          <li key={label.name}>
            <LabelChip name={label.name} color={label.color} priority={label.priority} />
          </li>
        ))}
      </ul>
    </div>
  );
}
