import { useMemo } from 'react';

import { announce } from '@lib/announcer';
import { isCardList } from '@lib/blocks';
import { useBoardStore } from '@lib/boardStore';
import { useSelectionStore } from '@lib/selectionStore';
import { notifySuccess } from '@lib/toastStore';

function words(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * What can be done to several cards, lists or blocks at once. Each one goes through the same call
 * as when it is done alone, one after the other, so permissions, limits and the live updates for
 * everybody else are exactly the same.
 */
export function useBoardBulk() {
  return useMemo(() => {
    const board = () => useBoardStore.getState();
    const cardsOf = () =>
      board()
        .view?.lists.filter(isCardList)
        .flatMap((list) => list.cards) ?? [];

    return {
      async duplicateCards(ids: string[]) {
        const copies: string[] = [];
        for (const id of ids) {
          const copy = await board().duplicateCard(id);
          if (copy) copies.push(copy.id);
        }
        // The copies are what is picked now, as on a desktop.
        useSelectionStore.getState().setSelection(copies, [], false);
        if (copies.length > 0) {
          notifySuccess(`Duplicated ${words(copies.length, 'card')}.`);
          announce(`Duplicated ${words(copies.length, 'card')}.`);
        }
      },

      async duplicatePanels(ids: string[]) {
        let count = 0;
        for (const id of ids) {
          if (await board().duplicatePanel(id)) count += 1;
        }
        useSelectionStore.getState().clear();
        if (count > 0) {
          notifySuccess(`Duplicated ${words(count, 'list or block')}.`);
          announce(`Duplicated ${words(count, 'list or block')}.`);
        }
      },

      async moveCards(ids: string[], listId: string, index?: number) {
        const target = () => board().view?.lists.find((list) => list.id === listId);
        let at = index;
        for (const id of ids) {
          const position = at ?? target()?.cards.length ?? 0;
          await board().moveCard(id, listId, position);
          if (at !== undefined) at += 1;
        }
        announce(`Moved ${words(ids.length, 'card')} to ${target()?.name ?? 'the list'}.`);
      },

      async setDueDate(ids: string[], day: string | null) {
        for (const id of ids) await board().setCardDueDate(id, day);
        announce(
          day
            ? `Due date set on ${words(ids.length, 'card')}.`
            : `Due date cleared on ${words(ids.length, 'card')}.`
        );
      },

      async setLabel(ids: string[], labelId: string, on: boolean) {
        const all = cardsOf();
        for (const id of ids) {
          const current = all.find((card) => card.id === id)?.label_ids ?? [];
          const next = on
            ? Array.from(new Set([...current, labelId]))
            : current.filter((item) => item !== labelId);
          await board().setCardLabels(id, next);
        }
      },

      async setAssignee(ids: string[], userId: string, on: boolean) {
        const all = cardsOf();
        for (const id of ids) {
          const current = all.find((card) => card.id === id)?.assignee_ids ?? [];
          const next = on
            ? Array.from(new Set([...current, userId]))
            : current.filter((item) => item !== userId);
          await board().setCardAssignees(id, next);
        }
      },

      async deleteCards(ids: string[]) {
        for (const id of ids) await board().deleteCard(id);
        useSelectionStore.getState().clear();
        announce(`Deleted ${words(ids.length, 'card')}.`);
      },

      async deletePanels(ids: string[]) {
        for (const id of ids) await board().deleteList(id);
        useSelectionStore.getState().clear();
        announce(`Deleted ${words(ids.length, 'list or block')}.`);
      },
    };
  }, []);
}
