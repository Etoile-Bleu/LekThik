import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { BoardMetaProvider } from '@hooks/useBoardMeta';
import { useDocumentTitle } from '@hooks/useDocumentTitle';
import { useToday } from '@hooks/useToday';
import { groupMyCards } from '@lib/myCards';
import { useMyCardsStore } from '@lib/myCardsStore';

import { DueBadge } from '../components/board/DueBadge';
import { AlertIcon, CheckCircleIcon } from '../components/ui/Icons';
import './MyCardsPage.css';

/**
 * Every card assigned to you, across workspaces, ordered by how soon it is
 * due. Overdue sits first on purpose, and each row is a link that opens the
 * card on its board.
 */
export function MyCardsPage() {
  const today = useToday();
  const cards = useMyCardsStore((state) => state.cards);
  const status = useMyCardsStore((state) => state.status);
  const load = useMyCardsStore((state) => state.load);
  const refresh = useMyCardsStore((state) => state.refresh);
  const watch = useMyCardsStore((state) => state.watch);
  const [workspaceId, setWorkspaceId] = useState('');

  useDocumentTitle('My cards');

  useEffect(() => {
    // Cards already on screen stay while they are checked, so coming back never flashes.
    void (useMyCardsStore.getState().status === 'ready' ? refresh() : load());
    // The live stream keeps the page current while it is open; coming back to the tab covers
    // the time the stream was not listening.
    const stopWatching = watch();
    const onShow = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      stopWatching();
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [load, refresh, watch]);

  const workspaces = useMemo(() => {
    const seen = new Map<string, string>();
    for (const card of cards) seen.set(card.workspace_id, card.workspace_name);
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [cards]);

  // A workspace left behind (all its cards done) must not leave the filter stuck on nothing.
  const activeWorkspace = workspaces.some((workspace) => workspace.id === workspaceId)
    ? workspaceId
    : '';
  const shown = useMemo(
    () => (activeWorkspace ? cards.filter((card) => card.workspace_id === activeWorkspace) : cards),
    [cards, activeWorkspace]
  );
  const groups = useMemo(() => groupMyCards(shown, today), [shown, today]);

  return (
    <BoardMetaProvider members={[]} meId={undefined} today={today}>
      <div className="my-cards">
        <header className="my-cards__header">
          <div>
            <h1 className="my-cards__title">My cards</h1>
            <p className="my-cards__subtitle" role="status">
              {status === 'ready' &&
                (shown.length === 0
                  ? 'Nothing is assigned to you.'
                  : `${shown.length} card${shown.length === 1 ? '' : 's'} assigned to you${
                      activeWorkspace || workspaces.length < 2
                        ? ''
                        : ` in ${workspaces.length} workspaces`
                    }.`)}
            </p>
          </div>
          {workspaces.length > 1 && (
            <div className="my-cards__filter">
              <label htmlFor="my-cards-workspace">Workspace</label>
              <select
                id="my-cards-workspace"
                value={activeWorkspace}
                onChange={(event) => setWorkspaceId(event.target.value)}
              >
                <option value="">All workspaces</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </header>

        {status === 'loading' && (
          <div className="my-cards__skeleton" role="status" aria-busy="true">
            <span className="sr-only">Loading your cards…</span>
            <span />
            <span />
            <span />
          </div>
        )}

        {status === 'error' && (
          <div className="my-cards__message">
            <p className="my-cards__message-title">Could not load your cards</p>
            <p>Check your connection and try again.</p>
            <button type="button" className="btn btn--primary" onClick={() => void load()}>
              Try again
            </button>
          </div>
        )}

        {status === 'ready' && shown.length === 0 && (
          <div className="my-cards__message my-cards__message--calm">
            <CheckCircleIcon size={28} />
            <p className="my-cards__message-title">All clear</p>
            <p>
              Cards show up here when someone assigns them to you, on any board of any workspace you
              belong to.
            </p>
            <Link className="btn btn--outline" to="/dashboard">
              Browse your workspaces
            </Link>
          </div>
        )}

        {status === 'ready' &&
          groups.map((group, groupIndex) => (
            <section
              key={group.key}
              className="my-cards__group"
              data-group={group.key}
              aria-labelledby={`my-cards-${group.key}`}
              style={{ '--group-index': groupIndex } as React.CSSProperties}
            >
              <h2 id={`my-cards-${group.key}`} className="my-cards__group-title">
                {group.key === 'overdue' && <AlertIcon size={15} />}
                {group.label}
                <span className="my-cards__count">
                  <span aria-hidden="true">{group.cards.length}</span>
                  <span className="sr-only">{`${group.cards.length} cards`}</span>
                </span>
              </h2>
              <ul className="my-cards__list">
                {group.cards.map((card) => (
                  <li key={card.id}>
                    <Link className="my-cards__row" to={`/b/${card.board_id}?card=${card.id}`}>
                      <span className="my-cards__due">
                        {card.due_date ? (
                          <DueBadge day={card.due_date} />
                        ) : (
                          <span className="my-cards__nodate" aria-hidden="true">
                            –
                          </span>
                        )}
                      </span>
                      <span className="my-cards__text">
                        <span className="my-cards__card-title">{card.title}</span>
                        <span className="my-cards__where">
                          {card.workspace_name}
                          <span aria-hidden="true"> / </span>
                          <span className="sr-only">, </span>
                          {card.board_name}
                          <span aria-hidden="true"> / </span>
                          <span className="sr-only">, </span>
                          {card.list_name}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </BoardMetaProvider>
  );
}
