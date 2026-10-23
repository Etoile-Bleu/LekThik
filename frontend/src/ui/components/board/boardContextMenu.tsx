import { KIND_LABEL, isCardList } from '@lib/blocks';
import type { BoardView, PanelKind } from '@lib/boardsApi';
import { parseQuickDate } from '@lib/commandStore';
import type { BoardViewKind } from '@lib/prefs';

import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CalendarIcon,
  CheckCircleIcon,
  CloseIcon,
  ColumnsIcon,
  CopyIcon,
  CursorIcon,
  FitIcon,
  FolderMoveIcon,
  GaugeIcon,
  HandIcon,
  LayoutIcon,
  LinkIcon,
  MaximizeIcon,
  NoteIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SelectAllIcon,
  SettingsIcon,
  TableIcon,
  TagIcon,
  TrashIcon,
  UsersIcon,
} from '../ui/Icons';
import type { MenuEntry } from '../ui/ContextMenu';

export type ContextTarget =
  { kind: 'card'; id: string } | { kind: 'panel'; id: string } | { kind: 'background' };

export interface BoardContext {
  view: BoardView;
  meId: string | undefined;
  editable: boolean;
  canManage: boolean;
  currentView: BoardViewKind;
  tool: 'select' | 'hand';
  selectedCards: string[];
  selectedPanels: string[];
  today: string;
  openCard: (id: string) => void;
  copyLink: (cardId: string) => void;
  select: (cards: string[], panels: string[]) => void;
  clearSelection: () => void;
  askDeleteCards: (ids: string[]) => void;
  askDeletePanels: (ids: string[]) => void;
  openLimit: (listId: string) => void;
  openBlockSettings: (blockId: string) => void;
  openPosition: (panelId: string) => void;
  renamePanel: (panelId: string) => void;
  addCardIn: (listId: string) => void;
  addList: () => void;
  addBlock: (kind: Exclude<PanelKind, 'list'>) => void;
  fit: () => void;
  changeView: (view: BoardViewKind) => void;
  setTool: (tool: 'select' | 'hand') => void;
  enterFullscreen: () => void;
  openPalette: () => void;
  actions: {
    duplicateCards: (ids: string[]) => void;
    duplicatePanels: (ids: string[]) => void;
    moveCards: (ids: string[], listId: string, index?: number) => void;
    setDueDate: (ids: string[], day: string | null) => void;
    setLabel: (ids: string[], labelId: string, on: boolean) => void;
    setAssignee: (ids: string[], userId: string, on: boolean) => void;
    movePanel: (panelId: string, index: number) => void;
  };
}

const BLOCK_KINDS: Array<Exclude<PanelKind, 'list'>> = [
  'calendar',
  'agenda',
  'note',
  'counter',
  'image',
  'embed',
  'link',
];

const VIEWS: Array<{ value: BoardViewKind; label: string }> = [
  { value: 'board', label: 'Board' },
  { value: 'canvas', label: 'Canvas' },
  { value: 'list', label: 'List' },
  { value: 'calendar', label: 'Calendar' },
];

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function addDays(day: string, amount: number): string {
  return parseQuickDate(`+${amount}d`, new Date(`${day}T12:00:00`)) ?? day;
}

/** What a right click offers on a card, one card or several picked ones. */
function cardEntries(context: BoardContext, ids: string[]): MenuEntry[] {
  const { view, actions } = context;
  const lists = view.lists.filter(isCardList);
  const cards = lists.flatMap((list) => list.cards);
  const chosen = cards.filter((card) => ids.includes(card.id));
  const many = ids.length > 1;
  const first = chosen[0];
  if (!first) return [];
  const open: MenuEntry[] = many
    ? [{ type: 'heading', label: `${plural(ids.length, 'card')} selected` }]
    : [
        {
          label: 'Open card',
          icon: <CheckCircleIcon size={16} />,
          shortcut: 'Enter',
          onSelect: () => context.openCard(first.id),
        },
        {
          label: 'Copy link',
          icon: <LinkIcon size={16} />,
          onSelect: () => context.copyLink(first.id),
        },
        { type: 'separator' },
      ];
  if (!context.editable) {
    return [
      ...open,
      {
        label: context.selectedCards.includes(first.id) ? 'Unselect' : 'Select',
        icon: <SelectAllIcon size={16} />,
        shortcut: 'X',
        onSelect: () =>
          context.select(
            context.selectedCards.includes(first.id)
              ? context.selectedCards.filter((id) => id !== first.id)
              : [...context.selectedCards, first.id],
            []
          ),
      },
    ];
  }

  const everyHas = (test: (card: (typeof chosen)[number]) => boolean) => chosen.every(test);
  const tomorrow = addDays(context.today, 1);
  const nextWeek = addDays(context.today, 7);
  const sourceList = many ? null : lists.find((list) => list.id === first.list_id);
  const at = sourceList ? sourceList.cards.findIndex((card) => card.id === first.id) : -1;

  const entries: MenuEntry[] = [
    ...open,
    {
      label: many ? `Duplicate ${plural(ids.length, 'card')}` : 'Duplicate',
      icon: <CopyIcon size={16} />,
      shortcut: 'Ctrl D',
      onSelect: () => actions.duplicateCards(ids),
    },
    { type: 'separator' },
    {
      type: 'submenu',
      label: 'Due date',
      icon: <CalendarIcon size={16} />,
      items: [
        {
          label: 'Today',
          checked: everyHas((card) => card.due_date === context.today),
          onSelect: () => actions.setDueDate(ids, context.today),
        },
        {
          label: 'Tomorrow',
          checked: everyHas((card) => card.due_date === tomorrow),
          onSelect: () => actions.setDueDate(ids, tomorrow),
        },
        {
          label: 'Next week',
          checked: everyHas((card) => card.due_date === nextWeek),
          onSelect: () => actions.setDueDate(ids, nextWeek),
        },
        { type: 'separator' },
        {
          label: 'Pick a date…',
          icon: <CalendarIcon size={16} />,
          disabled: many,
          onSelect: () => context.openCard(first.id),
        },
        {
          label: 'Clear the date',
          disabled: chosen.every((card) => card.due_date === null),
          onSelect: () => actions.setDueDate(ids, null),
        },
      ],
    },
    {
      type: 'submenu',
      label: 'Assign',
      icon: <UsersIcon size={16} />,
      items:
        view.members.length === 0
          ? [{ label: 'Nobody to assign', disabled: true, onSelect: () => undefined }]
          : view.members.map<MenuEntry>((member) => ({
              label: member.user_id === context.meId ? `${member.username} (you)` : member.username,
              checked: everyHas((card) => card.assignee_ids.includes(member.user_id)),
              onSelect: () =>
                actions.setAssignee(
                  ids,
                  member.user_id,
                  !everyHas((card) => card.assignee_ids.includes(member.user_id))
                ),
            })),
    },
    {
      type: 'submenu',
      label: 'Labels',
      icon: <TagIcon size={16} />,
      items:
        view.labels.length === 0
          ? [{ label: 'No labels on this board', disabled: true, onSelect: () => undefined }]
          : view.labels.map<MenuEntry>((label) => ({
              label: label.name,
              checked: everyHas((card) => card.label_ids.includes(label.id)),
              onSelect: () =>
                actions.setLabel(
                  ids,
                  label.id,
                  !everyHas((card) => card.label_ids.includes(label.id))
                ),
            })),
    },
    {
      type: 'submenu',
      label: 'Move to list',
      icon: <FolderMoveIcon size={16} />,
      items: lists.map<MenuEntry>((list) => ({
        label: list.name,
        disabled: !many && list.id === first.list_id,
        onSelect: () => actions.moveCards(ids, list.id),
      })),
    },
  ];
  if (!many && sourceList) {
    entries.push(
      {
        label: 'Move to the top',
        icon: <ArrowUpIcon size={16} />,
        disabled: at === 0,
        onSelect: () => actions.moveCards([first.id], sourceList.id, 0),
      },
      {
        label: 'Move to the bottom',
        icon: <ArrowDownIcon size={16} />,
        disabled: at === sourceList.cards.length - 1,
        onSelect: () => actions.moveCards([first.id], sourceList.id, sourceList.cards.length),
      }
    );
  }
  entries.push({ type: 'separator' });
  if (many) {
    entries.push({
      label: 'Clear selection',
      icon: <CloseIcon size={16} />,
      shortcut: 'Esc',
      onSelect: context.clearSelection,
    });
  } else {
    entries.push({
      label: context.selectedCards.includes(first.id) ? 'Unselect' : 'Select',
      icon: <SelectAllIcon size={16} />,
      shortcut: 'X',
      onSelect: () =>
        context.select(
          context.selectedCards.includes(first.id)
            ? context.selectedCards.filter((id) => id !== first.id)
            : [...context.selectedCards, first.id],
          []
        ),
    });
  }
  entries.push({
    label: many ? `Delete ${plural(ids.length, 'card')}` : 'Delete card',
    icon: <TrashIcon size={16} />,
    danger: true,
    shortcut: 'Del',
    onSelect: () => context.askDeleteCards(ids),
  });
  return entries;
}

/** What a right click offers on a list or a block, or on several picked ones. */
function panelEntries(context: BoardContext, ids: string[]): MenuEntry[] {
  const { view, actions } = context;
  const panels = view.lists.filter((panel) => ids.includes(panel.id));
  const first = panels[0];
  if (!first) return [];
  if (!context.editable) return [];
  const many = ids.length > 1;
  if (many) {
    return [
      { type: 'heading', label: `${plural(ids.length, 'list or block')} selected` },
      {
        label: `Duplicate ${plural(ids.length, 'panel')}`,
        icon: <CopyIcon size={16} />,
        shortcut: 'Ctrl D',
        onSelect: () => actions.duplicatePanels(ids),
      },
      { type: 'separator' },
      {
        label: 'Clear selection',
        icon: <CloseIcon size={16} />,
        shortcut: 'Esc',
        onSelect: context.clearSelection,
      },
      {
        label: `Delete ${plural(ids.length, 'panel')}`,
        icon: <TrashIcon size={16} />,
        danger: true,
        shortcut: 'Del',
        onSelect: () => context.askDeletePanels(ids),
      },
    ];
  }

  const list = isCardList(first);
  const order = view.lists.findIndex((panel) => panel.id === first.id);
  const others = view.lists.filter(isCardList).filter((candidate) => candidate.id !== first.id);
  const layout =
    context.currentView === 'canvas'
      ? [
          {
            label: 'Position and size…',
            icon: <LayoutIcon size={16} />,
            onSelect: () => context.openPosition(first.id),
          } as MenuEntry,
        ]
      : context.currentView === 'board'
        ? [
            {
              label: 'Move left',
              icon: <ArrowLeftIcon size={16} />,
              disabled: order === 0,
              onSelect: () => actions.movePanel(first.id, order - 1),
            } as MenuEntry,
            {
              label: 'Move right',
              icon: <ArrowRightIcon size={16} />,
              disabled: order === view.lists.length - 1,
              onSelect: () => actions.movePanel(first.id, order + 1),
            } as MenuEntry,
          ]
        : [];

  const entries: MenuEntry[] = [];
  if (list) {
    entries.push({
      label: 'Add a card…',
      icon: <PlusIcon size={16} />,
      onSelect: () => context.addCardIn(first.id),
    });
  } else {
    entries.push({
      label: 'Block settings…',
      icon: <SettingsIcon size={16} />,
      onSelect: () => context.openBlockSettings(first.id),
    });
  }
  entries.push(
    {
      label: list ? 'Rename list' : 'Rename block',
      icon: <PencilIcon size={16} />,
      onSelect: () => context.renamePanel(first.id),
    },
    {
      label: list ? 'Duplicate list' : 'Duplicate block',
      icon: <CopyIcon size={16} />,
      shortcut: 'Ctrl D',
      onSelect: () => actions.duplicatePanels([first.id]),
    },
    { type: 'separator' }
  );
  if (list) {
    entries.push(
      {
        label: first.wip_limit === null ? 'Set a card limit…' : 'Change the card limit…',
        icon: <GaugeIcon size={16} />,
        onSelect: () => context.openLimit(first.id),
      },
      {
        type: 'submenu',
        label: 'Move all cards to',
        icon: <FolderMoveIcon size={16} />,
        disabled: first.cards.length === 0 || others.length === 0,
        items: others.map<MenuEntry>((other) => ({
          label: other.name,
          onSelect: () =>
            actions.moveCards(
              first.cards.map((card) => card.id),
              other.id
            ),
        })),
      },
      {
        label: 'Select all its cards',
        icon: <SelectAllIcon size={16} />,
        disabled: first.cards.length === 0,
        onSelect: () =>
          context.select(
            first.cards.map((card) => card.id),
            []
          ),
      }
    );
  }
  entries.push(
    ...layout,
    { type: 'separator' },
    {
      label: list ? 'Delete list' : 'Delete block',
      icon: <TrashIcon size={16} />,
      danger: true,
      onSelect: () => context.askDeletePanels([first.id]),
    }
  );
  return entries;
}

/** What a right click offers on the empty background of the board. */
function backgroundEntries(context: BoardContext): MenuEntry[] {
  const allCards = context.view.lists
    .filter(isCardList)
    .flatMap((list) => list.cards.map((card) => card.id));
  const entries: MenuEntry[] = [];
  if (context.editable) {
    entries.push(
      { label: 'Add a list…', icon: <PlusIcon size={16} />, onSelect: context.addList },
      {
        type: 'submenu',
        label: 'Add a block',
        icon: <NoteIcon size={16} />,
        items: BLOCK_KINDS.map<MenuEntry>((kind) => ({
          label: KIND_LABEL[kind],
          onSelect: () => context.addBlock(kind),
        })),
      }
    );
    if (context.currentView === 'canvas') {
      entries.push({ label: 'Fit the layout', icon: <FitIcon size={16} />, onSelect: context.fit });
    }
    entries.push({ type: 'separator' });
  }
  entries.push({
    label: 'Select all cards',
    icon: <SelectAllIcon size={16} />,
    shortcut: 'Ctrl A',
    disabled: allCards.length === 0,
    onSelect: () => context.select(allCards, []),
  });
  if (context.selectedCards.length + context.selectedPanels.length > 0) {
    entries.push({
      label: 'Clear selection',
      icon: <CloseIcon size={16} />,
      shortcut: 'Esc',
      onSelect: context.clearSelection,
    });
  }
  entries.push(
    { type: 'separator' },
    {
      label: 'Free navigation',
      icon: context.tool === 'hand' ? <HandIcon size={16} /> : <CursorIcon size={16} />,
      shortcut: 'H',
      checked: context.tool === 'hand',
      onSelect: () => context.setTool(context.tool === 'hand' ? 'select' : 'hand'),
    },
    {
      type: 'submenu',
      label: 'View',
      icon: <ColumnsIcon size={16} />,
      items: VIEWS.map<MenuEntry>((item) => ({
        label: item.label,
        icon:
          item.value === 'list' ? (
            <TableIcon size={16} />
          ) : item.value === 'calendar' ? (
            <CalendarIcon size={16} />
          ) : undefined,
        checked: context.currentView === item.value,
        onSelect: () => context.changeView(item.value),
      })),
    },
    {
      label: 'Enter full screen',
      icon: <MaximizeIcon size={16} />,
      onSelect: context.enterFullscreen,
    },
    {
      label: 'Search or run a command…',
      icon: <SearchIcon size={16} />,
      shortcut: 'Ctrl K',
      onSelect: context.openPalette,
    }
  );
  return entries;
}

/**
 * The entries of the menu a right click opens, by what was under it. A click on a card or a panel
 * that is part of a bigger selection acts on the whole selection, as it does on a desktop.
 */
export function boardContextEntries(target: ContextTarget, context: BoardContext): MenuEntry[] {
  if (target.kind === 'card') {
    const inSelection =
      context.selectedCards.includes(target.id) && context.selectedCards.length > 1;
    return cardEntries(context, inSelection ? context.selectedCards : [target.id]);
  }
  if (target.kind === 'panel') {
    const inSelection =
      context.selectedPanels.includes(target.id) && context.selectedPanels.length > 1;
    return panelEntries(context, inSelection ? context.selectedPanels : [target.id]);
  }
  return backgroundEntries(context);
}

/** A name for the menu, for people who use a screen reader. */
export function contextMenuLabel(target: ContextTarget, context: BoardContext): string {
  if (target.kind === 'card') {
    const card = context.view.lists
      .flatMap((list) => list.cards)
      .find((item) => item.id === target.id);
    return card ? `Actions for card ${card.title}` : 'Card actions';
  }
  if (target.kind === 'panel') {
    const panel = context.view.lists.find((item) => item.id === target.id);
    return panel ? `Actions for ${isCardList(panel) ? 'list' : 'block'} ${panel.name}` : 'Actions';
  }
  return 'Board actions';
}
