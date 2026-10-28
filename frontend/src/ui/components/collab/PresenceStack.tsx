import { Link } from 'react-router-dom';

import { useLeaving } from '@hooks/useLeaving';
import type { Viewer } from '@lib/boardsApi';
import { nameList, usePresenceStore } from '@lib/presenceStore';

import { Popover } from '../ui/Popover';
import { PresenceAvatar } from './PresenceAvatar';
import './PresenceStack.css';

const MAX_SHOWN = 4;

interface PresenceStackProps {
  /** The title of a card of this board, so the list can say what someone is looking at. */
  cardTitle: (cardId: string) => string | undefined;
  onOpenCard: (cardId: string) => void;
}

/**
 * Who else is on this board right now, in the board header. The avatars are the glance, the
 * button around them opens the list with names and the card each person has open, and the words
 * are always there for people who cannot see the avatars.
 */
export function PresenceStack({ cardTitle, onOpenCard }: PresenceStackProps) {
  const viewers = usePresenceStore((state) => state.viewers);
  const staged = useLeaving<Viewer>(viewers, (viewer) => viewer.user_id);
  if (staged.length === 0) return null;

  const shown = staged.slice(0, MAX_SHOWN);
  const extra = staged.length - shown.length;
  const names = viewers.map((viewer) => viewer.username);
  const summary =
    viewers.length === 0
      ? 'Nobody else is here'
      : `${nameList(names)} ${viewers.length === 1 ? 'is' : 'are'} on this board`;

  return (
    <Popover
      label="Who is on this board"
      triggerClassName="presence-stack"
      trigger={
        <>
          <span className="presence-stack__faces" aria-hidden="true">
            {shown.map(({ item, leaving }, index) => (
              <span
                key={item.user_id}
                className="presence-stack__face"
                style={{ zIndex: shown.length - index }}
                data-leaving={leaving || undefined}
              >
                <PresenceAvatar name={item.username} seed={item.user_id} leaving={leaving} />
              </span>
            ))}
            {extra > 0 && <span className="presence-stack__more">+{extra}</span>}
          </span>
          <span className="sr-only">{summary}</span>
        </>
      }
    >
      {() => (
        <div className="presence-panel">
          <h2 className="presence-panel__title">Here now</h2>
          {viewers.length === 0 ? (
            <p className="presence-panel__empty">Nobody else is here.</p>
          ) : (
            <ul className="presence-panel__list">
              {viewers.map((viewer) => {
                const title = viewer.card_id ? cardTitle(viewer.card_id) : undefined;
                return (
                  <li key={viewer.user_id} className="presence-panel__row">
                    <PresenceAvatar name={viewer.username} seed={viewer.user_id} />
                    <span className="presence-panel__who">
                      <span className="presence-panel__name">{viewer.username}</span>
                      {viewer.card_id && title ? (
                        <button
                          type="button"
                          className="presence-panel__card"
                          onClick={() => onOpenCard(viewer.card_id as string)}
                        >
                          Looking at {title}
                        </button>
                      ) : (
                        <span className="presence-panel__where">On this board</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="presence-panel__note">
            Only people in this workspace can see this, and nothing is stored. You can hide yourself
            in the <Link to="/settings/privacy">privacy settings</Link>.
          </p>
        </div>
      )}
    </Popover>
  );
}
