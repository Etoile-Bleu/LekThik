import { useLeaving } from '@hooks/useLeaving';
import type { Viewer } from '@lib/boardsApi';
import { nameList, usePresenceStore } from '@lib/presenceStore';

import { PresenceAvatar } from './PresenceAvatar';
import './PresenceOnCard.css';

const NONE: Viewer[] = [];

/** On a card of the board: small avatars of the people who have this card open right now. */
export function PresenceOnCard({ cardId }: { cardId: string }) {
  const viewers = usePresenceStore((state) => state.byCard[cardId]) ?? NONE;
  const staged = useLeaving<Viewer>(viewers, (viewer) => viewer.user_id);
  if (staged.length === 0) return null;
  const shown = staged.slice(0, 2);
  const extra = staged.length - shown.length;
  const names = nameList(viewers.map((viewer) => viewer.username));

  return (
    <span
      className="presence-card"
      title={`${names} ${viewers.length === 1 ? 'is' : 'are'} looking at this card`}
    >
      {shown.map(({ item, leaving }) => (
        <span
          key={item.user_id}
          className="presence-card__face"
          data-leaving={leaving || undefined}
        >
          <PresenceAvatar name={item.username} seed={item.user_id} size="xs" leaving={leaving} />
        </span>
      ))}
      {extra > 0 && (
        <span className="presence-card__more" aria-hidden="true">
          +{extra}
        </span>
      )}
      {viewers.length > 0 && (
        <span className="sr-only">
          {names} {viewers.length === 1 ? 'is' : 'are'} looking at this card
        </span>
      )}
    </span>
  );
}

/** In the card dialog: who else has this very card open. */
export function PresenceHere({ cardId }: { cardId: string }) {
  const viewers = usePresenceStore((state) => state.byCard[cardId]) ?? NONE;
  const staged = useLeaving<Viewer>(viewers, (viewer) => viewer.user_id);
  if (staged.length === 0) return null;

  return (
    <p className="presence-here">
      <span className="presence-here__faces" aria-hidden="true">
        {staged.slice(0, 4).map(({ item, leaving }) => (
          <span
            key={item.user_id}
            className="presence-here__face"
            data-leaving={leaving || undefined}
          >
            <PresenceAvatar name={item.username} seed={item.user_id} leaving={leaving} />
          </span>
        ))}
      </span>
      <span>
        {viewers.length > 0
          ? `${nameList(viewers.map((viewer) => viewer.username))} ${viewers.length === 1 ? 'is' : 'are'} also here`
          : ''}
      </span>
    </p>
  );
}
