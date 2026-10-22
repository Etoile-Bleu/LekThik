import { type ReactNode, createContext, useContext, useMemo } from 'react';

import type { BoardMember } from '@lib/boardsApi';

interface BoardMeta {
  membersById: Map<string, BoardMember>;
  meId: string | undefined;
  today: string;
}

const BoardMetaContext = createContext<BoardMeta>({
  membersById: new Map(),
  meId: undefined,
  today: '1970-01-01',
});

interface BoardMetaProviderProps {
  members: BoardMember[];
  meId: string | undefined;
  today: string;
  children: ReactNode;
}

/** What every card on the board needs to draw people and dates, without prop drilling. */
// eslint-disable-next-line react-refresh/only-export-components
export function BoardMetaProvider({ members, meId, today, children }: BoardMetaProviderProps) {
  const value = useMemo<BoardMeta>(
    () => ({
      membersById: new Map(members.map((member) => [member.user_id, member])),
      meId,
      today,
    }),
    [members, meId, today]
  );

  return <BoardMetaContext.Provider value={value}>{children}</BoardMetaContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBoardMeta(): BoardMeta {
  return useContext(BoardMetaContext);
}
