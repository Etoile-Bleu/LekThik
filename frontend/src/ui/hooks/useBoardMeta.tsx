import { type ReactNode, createContext, useContext, useMemo } from 'react';

import type { BoardMember, Label } from '@lib/boardsApi';
import { type CardDisplay, DEFAULT_CARD_DISPLAY } from '@lib/prefs';

interface BoardMeta {
  membersById: Map<string, BoardMember>;
  labels: Label[];
  meId: string | undefined;
  today: string;
  /** What the signed in person wants cards on this board to show. */
  display: CardDisplay;
}

const BoardMetaContext = createContext<BoardMeta>({
  membersById: new Map(),
  labels: [],
  meId: undefined,
  today: '1970-01-01',
  display: DEFAULT_CARD_DISPLAY,
});

const NO_LABELS: Label[] = [];

interface BoardMetaProviderProps {
  members: BoardMember[];
  labels?: Label[];
  meId: string | undefined;
  today: string;
  display?: CardDisplay;
  children: ReactNode;
}

/** What every card on the board needs to draw people and dates, without prop drilling. */
// eslint-disable-next-line react-refresh/only-export-components
export function BoardMetaProvider({
  members,
  labels = NO_LABELS,
  meId,
  today,
  display = DEFAULT_CARD_DISPLAY,
  children,
}: BoardMetaProviderProps) {
  const value = useMemo<BoardMeta>(
    () => ({
      membersById: new Map(members.map((member) => [member.user_id, member])),
      labels,
      meId,
      today,
      display,
    }),
    [members, labels, meId, today, display]
  );

  return <BoardMetaContext.Provider value={value}>{children}</BoardMetaContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBoardMeta(): BoardMeta {
  return useContext(BoardMetaContext);
}
