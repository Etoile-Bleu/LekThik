import { BoardMetaProvider } from '@hooks/useBoardMeta';
import { useToday } from '@hooks/useToday';
import type { CardSummary, Label } from '@lib/boardsApi';
import { addDays } from '@lib/dueDate';
import { usePrefsStore } from '@lib/prefsStore';

import { CardFace } from '../board/BoardCard';
import './SettingsPreview.css';

const MEMBERS = [
  { user_id: 'amir', username: 'Amir' },
  { user_id: 'wen', username: 'Wen' },
  { user_id: 'olga', username: 'Olga' },
];

const LABELS: Label[] = [
  { id: 'urgent', board_id: 'preview', name: 'Urgent', color: 'red', priority: 'urgent' },
  { id: 'design', board_id: 'preview', name: 'Design', color: 'violet', priority: 'none' },
  { id: 'growth', board_id: 'preview', name: 'Growth', color: 'green', priority: 'none' },
  { id: 'research', board_id: 'preview', name: 'Research', color: 'blue', priority: 'low' },
  { id: 'partners', board_id: 'preview', name: 'Partners', color: 'orange', priority: 'none' },
];

function cards(today: string): CardSummary[] {
  const base = { list_id: 'preview', has_description: true };
  return [
    {
      ...base,
      id: 'c1',
      title: 'Write the launch post',
      description_preview: 'Announce the beta with a short story and three screenshots.',
      label_ids: ['urgent', 'design'],
      assignee_ids: ['amir', 'wen'],
      due_date: addDays(today, 1),
    },
    {
      ...base,
      id: 'c2',
      title: 'Fix the signup bug',
      description_preview: 'Safari drops the verification code on paste.',
      label_ids: ['partners'],
      assignee_ids: ['olga'],
      due_date: addDays(today, -2),
    },
    {
      ...base,
      id: 'c3',
      title: 'Plan the demo',
      has_description: false,
      description_preview: '',
      label_ids: ['growth', 'research'],
      assignee_ids: [],
      due_date: null,
    },
  ];
}

/**
 * A real piece of a board, drawn with the real card component, so it shows
 * every change as it happens: theme, font, spacing, colour vision, density and
 * what a card displays. Decorative for assistive technology, the settings
 * themselves are the content.
 */
export function SettingsPreview() {
  const today = useToday();
  const display = usePrefsStore((state) => state.prefs.card_display);
  const labelsById = new Map(LABELS.map((label) => [label.id, label]));

  return (
    <BoardMetaProvider members={MEMBERS} meId="amir" today={today} display={display}>
      <div className="settings-preview" aria-hidden="true">
        <div className="settings-preview__head">
          <span className="settings-preview__title">Launch plan</span>
          <span className="settings-preview__hint">Live preview</span>
        </div>
        <div className="board-list settings-preview__list">
          <div className="board-list__header">
            <div className="board-list__title">
              <span className="board-list__name">In production</span>
            </div>
            <span className="board-list__count">3</span>
          </div>
          <ul className="board-list__cards">
            {cards(today).map((card) => (
              <li key={card.id} className="board-card">
                <div className="board-card__open">
                  <CardFace
                    card={card}
                    labels={card.label_ids
                      .map((id) => labelsById.get(id))
                      .filter((label): label is Label => label !== undefined)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </BoardMetaProvider>
  );
}
