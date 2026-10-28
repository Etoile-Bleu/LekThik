import { BLOCK_KIND_IDS, KIND_LABEL, isCardList } from '@lib/blocks';
import type { BoardView, PanelKind } from '@lib/boardsApi';
import { type CardFilter, EMPTY_FILTER } from '@lib/boardModel';
import { type Command, parseQuickDate } from '@lib/commandStore';
import type { BoardViewKind } from '@lib/prefs';

import {
  CalendarIcon,
  CheckCircleIcon,
  ColumnsIcon,
  FilterIcon,
  FitIcon,
  GaugeIcon,
  LayoutIcon,
  NoteIcon,
  PencilIcon,
  PlusIcon,
  SettingsIcon,
  TableIcon,
  TagIcon,
  TrashIcon,
  UsersIcon,
} from '../ui/Icons';

export interface BoardCommandContext {
  view: BoardView;
  meId: string | undefined;
  editable: boolean;
  canManage: boolean;
  currentView: BoardViewKind;
  filter: CardFilter;
  setFilter: (filter: CardFilter) => void;
  changeView: (view: BoardViewKind) => void;
  fit: () => void;
  openCard: (id: string) => void;
  openMembers: () => void;
  openLabels: () => void;
  openLimit: (listId: string) => void;
  openBlockSettings: (blockId: string) => void;
  openPosition: (panelId: string) => void;
  askDelete: (panelId: string) => void;
  askDeleteBoard: () => void;
  addBlock: (kind: Exclude<PanelKind, 'list'>) => void;
  actions: {
    createCard: (listId: string, title: string) => Promise<unknown>;
    createList: (name: string) => Promise<unknown>;
    renameBoard: (name: string) => Promise<unknown>;
    renameList: (listId: string, name: string) => Promise<unknown>;
    moveCard: (cardId: string, listId: string, index: number) => Promise<unknown>;
    setCardDueDate: (cardId: string, day: string | null) => Promise<unknown>;
    setCardAssignees: (cardId: string, userIds: string[]) => Promise<unknown>;
  };
}

const VIEW_NAMES: Record<BoardViewKind, string> = {
  board: 'Board',
  canvas: 'Canvas',
  list: 'List',
  calendar: 'Calendar',
};

const VIEW_ICONS: Record<BoardViewKind, JSX.Element> = {
  board: <ColumnsIcon size={16} />,
  canvas: <LayoutIcon size={16} />,
  list: <TableIcon size={16} />,
  calendar: <CalendarIcon size={16} />,
};

/** What can be done with the board that is open, on top of what can be done anywhere. */
export function boardCommands(context: BoardCommandContext): Command[] {
  const { view, editable, actions } = context;
  const lists = view.lists.filter(isCardList);
  const panels = view.lists;
  const cards = lists.flatMap((list) => list.cards.map((card) => ({ card, list })));
  const listChoices = () =>
    lists.map((list) => ({
      id: list.id,
      title: list.name,
      hint: `${list.cards.length} card${list.cards.length === 1 ? '' : 's'}`,
      icon: <ColumnsIcon size={16} />,
    }));
  const cardChoices = () =>
    cards.map(({ card, list }) => ({
      id: card.id,
      title: card.title,
      hint: list.name,
      icon: <CheckCircleIcon size={16} />,
    }));
  const panelChoices = () =>
    panels.map((panel) => ({
      id: panel.id,
      title: panel.name,
      hint: isCardList(panel) ? 'List' : KIND_LABEL[panel.kind],
      icon: isCardList(panel) ? <ColumnsIcon size={16} /> : <NoteIcon size={16} />,
    }));
  const titleOf = (id: string) => cards.find(({ card }) => card.id === id)?.card.title ?? 'card';
  const listName = (id: string) => lists.find((list) => list.id === id)?.name ?? 'list';

  const commands: Command[] = [];

  // Every card is findable by its title.
  for (const { card, list } of cards) {
    commands.push({
      id: `card:${card.id}`,
      title: card.title,
      group: 'Cards',
      hint: list.name,
      keywords: ['open card'],
      icon: <CheckCircleIcon size={16} />,
      searchOnly: true,
      run: () => context.openCard(card.id),
    });
  }

  commands.push(
    ...(['board', 'canvas', 'list', 'calendar'] as const)
      .filter((kind) => kind !== context.currentView)
      .map<Command>((kind) => ({
        id: `view:${kind}`,
        title: `Show as ${VIEW_NAMES[kind].toLowerCase()}`,
        group: 'View',
        keywords: ['view', 'switch', VIEW_NAMES[kind]],
        icon: VIEW_ICONS[kind],
        run: () => context.changeView(kind),
      })),
    {
      id: 'filter:mine',
      title: context.filter.mine ? 'Stop showing only my cards' : 'Show only my cards',
      group: 'View',
      keywords: ['filter', 'assigned to me'],
      icon: <FilterIcon size={16} />,
      run: () => context.setFilter({ ...context.filter, mine: !context.filter.mine }),
    },
    {
      id: 'filter:overdue',
      title: context.filter.overdue ? 'Stop showing only overdue cards' : 'Show only overdue cards',
      group: 'View',
      keywords: ['filter', 'late', 'past due'],
      icon: <FilterIcon size={16} />,
      run: () => context.setFilter({ ...context.filter, overdue: !context.filter.overdue }),
    }
  );

  if (context.filter.mine || context.filter.overdue || context.filter.labelIds.length > 0) {
    commands.push({
      id: 'filter:clear',
      title: 'Clear filters',
      group: 'View',
      keywords: ['reset', 'show all'],
      icon: <FilterIcon size={16} />,
      suggested: true,
      run: () => context.setFilter(EMPTY_FILTER),
    });
  }

  commands.push({
    id: 'board:members',
    title: 'Members',
    group: 'This board',
    keywords: ['people', 'invite', 'share', 'team'],
    icon: <UsersIcon size={16} />,
    run: context.openMembers,
  });

  if (!editable) return commands;

  commands.push(
    {
      id: 'create:card',
      title: 'Add a card…',
      group: 'Create',
      keywords: ['new card', 'task', 'create card'],
      icon: <PlusIcon size={16} />,
      suggested: lists.length > 0,
      steps: [
        { kind: 'choose', prompt: 'In which list?', choices: listChoices },
        { kind: 'text', prompt: 'Title of the card' },
      ],
      finish: async ([listId, title]) => {
        await actions.createCard(listId, title);
        return `Added “${title}” to ${listName(listId)}.`;
      },
    },
    {
      id: 'create:list',
      title: 'Add a list…',
      group: 'Create',
      keywords: ['new list', 'column', 'create list'],
      icon: <PlusIcon size={16} />,
      steps: [{ kind: 'text', prompt: 'Name of the list' }],
      finish: async ([name]) => {
        await actions.createList(name);
        return `List “${name}” added.`;
      },
    },
    {
      id: 'create:block',
      title: 'Add a block…',
      group: 'Create',
      keywords: [
        'calendar',
        'agenda',
        'note',
        'counter',
        'progress',
        'picture',
        'image',
        'video',
        'link',
      ],
      icon: <PlusIcon size={16} />,
      steps: [
        {
          kind: 'choose',
          prompt: 'Which kind of block?',
          choices: () =>
            BLOCK_KIND_IDS.map((kind) => ({
              id: kind,
              title: KIND_LABEL[kind],
              icon: <NoteIcon size={16} />,
            })),
        },
      ],
      finish: ([kind]) => {
        context.addBlock(kind as Exclude<PanelKind, 'list'>);
      },
    },
    {
      id: 'board:fit',
      title: 'Fit the layout',
      group: 'This board',
      keywords: ['arrange', 'organise', 'organize', 'tidy', 'auto layout', 'canvas'],
      icon: <FitIcon size={16} />,
      suggested: context.currentView === 'canvas',
      run: context.fit,
    },
    {
      id: 'board:rename',
      title: 'Rename this board…',
      group: 'This board',
      keywords: ['title', 'name'],
      icon: <PencilIcon size={16} />,
      steps: [{ kind: 'text', prompt: 'New name for the board' }],
      finish: async ([name]) => {
        await actions.renameBoard(name);
        return `Board renamed to “${name}”.`;
      },
    },
    {
      id: 'board:labels',
      title: 'Labels',
      group: 'This board',
      keywords: ['tags', 'priority', 'colours'],
      icon: <TagIcon size={16} />,
      run: context.openLabels,
    }
  );

  if (lists.length > 0) {
    commands.push(
      {
        id: 'list:rename',
        title: 'Rename a list…',
        group: 'This board',
        icon: <PencilIcon size={16} />,
        steps: [
          { kind: 'choose', prompt: 'Which list?', choices: listChoices },
          { kind: 'text', prompt: 'New name for the list' },
        ],
        finish: async ([listId, name]) => {
          await actions.renameList(listId, name);
          return `List renamed to “${name}”.`;
        },
      },
      {
        id: 'list:limit',
        title: 'Set a card limit…',
        group: 'This board',
        keywords: ['wip', 'work in progress'],
        icon: <GaugeIcon size={16} />,
        steps: [{ kind: 'choose', prompt: 'Which list?', choices: listChoices }],
        finish: ([listId]) => context.openLimit(listId),
      }
    );
  }

  if (cards.length > 0) {
    commands.push(
      {
        id: 'card:move',
        title: 'Move a card to a list…',
        group: 'Cards',
        keywords: ['send', 'change list', 'status'],
        icon: <ColumnsIcon size={16} />,
        steps: [
          { kind: 'choose', prompt: 'Which card?', choices: cardChoices },
          { kind: 'choose', prompt: 'Move it to which list?', choices: listChoices },
        ],
        finish: async ([cardId, listId]) => {
          const end = lists.find((list) => list.id === listId)?.cards.length ?? 0;
          await actions.moveCard(cardId, listId, end);
          return `Moved “${titleOf(cardId)}” to ${listName(listId)}.`;
        },
      },
      {
        id: 'card:due',
        title: 'Set a due date…',
        group: 'Cards',
        keywords: ['deadline', 'date', 'schedule', 'calendar'],
        icon: <CalendarIcon size={16} />,
        steps: [
          { kind: 'choose', prompt: 'Which card?', choices: cardChoices },
          {
            kind: 'text',
            prompt: 'Due date',
            optional: true,
            examples: ['today', 'tomorrow', 'friday', '+3d', '2026-03-14', 'none'],
            validate: (text) =>
              text === '' || parseQuickDate(text) !== undefined
                ? null
                : 'Try today, tomorrow, a weekday, +3d, +2w or 2026-03-14. Say none to clear it.',
          },
        ],
        finish: async ([cardId, text]) => {
          const day = text === '' ? null : (parseQuickDate(text) ?? null);
          await actions.setCardDueDate(cardId, day);
          return day
            ? `Due date of “${titleOf(cardId)}” set to ${day}.`
            : `Due date of “${titleOf(cardId)}” cleared.`;
        },
      }
    );
    if (context.meId) {
      const meId = context.meId;
      commands.push({
        id: 'card:assign-me',
        title: 'Assign a card to me…',
        group: 'Cards',
        keywords: ['take', 'own', 'mine'],
        icon: <UsersIcon size={16} />,
        steps: [
          {
            kind: 'choose',
            prompt: 'Which card?',
            choices: () =>
              cards
                .filter(({ card }) => !card.assignee_ids.includes(meId))
                .map(({ card, list }) => ({
                  id: card.id,
                  title: card.title,
                  hint: list.name,
                  icon: <CheckCircleIcon size={16} />,
                })),
          },
        ],
        finish: async ([cardId]) => {
          const card = cards.find((item) => item.card.id === cardId)?.card;
          await actions.setCardAssignees(cardId, [...(card?.assignee_ids ?? []), meId]);
          return `“${titleOf(cardId)}” is yours now.`;
        },
      });
    }
  }

  if (panels.some((panel) => !isCardList(panel))) {
    commands.push({
      id: 'block:settings',
      title: 'Block settings…',
      group: 'This board',
      keywords: ['configure', 'edit block'],
      icon: <SettingsIcon size={16} />,
      steps: [
        {
          kind: 'choose',
          prompt: 'Which block?',
          choices: () => panelChoices().filter((choice) => choice.hint !== 'List'),
        },
      ],
      finish: ([blockId]) => context.openBlockSettings(blockId),
    });
  }

  if (context.currentView === 'canvas' && panels.length > 0) {
    commands.push({
      id: 'panel:position',
      title: 'Position and size…',
      group: 'This board',
      keywords: ['move', 'resize', 'place', 'canvas', 'layout'],
      icon: <LayoutIcon size={16} />,
      steps: [{ kind: 'choose', prompt: 'Which list or block?', choices: panelChoices }],
      finish: ([panelId]) => context.openPosition(panelId),
    });
  }

  if (panels.length > 0) {
    commands.push({
      id: 'panel:delete',
      title: 'Delete a list or block…',
      group: 'This board',
      keywords: ['remove'],
      icon: <TrashIcon size={16} />,
      steps: [{ kind: 'choose', prompt: 'Which one?', choices: panelChoices }],
      finish: ([panelId]) => context.askDelete(panelId),
    });
  }

  if (context.canManage) {
    commands.push({
      id: 'board:delete',
      title: 'Delete this board…',
      group: 'This board',
      keywords: ['remove'],
      icon: <TrashIcon size={16} />,
      run: context.askDeleteBoard,
    });
  }

  return commands;
}
