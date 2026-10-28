import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useId } from 'react';

import { useOpening } from '@hooks/useOpening';
import { KIND_LABEL, noteConfig } from '@lib/blocks';
import type { BoardList, PanelConfig, PanelKind } from '@lib/boardsApi';
import { splitDragListeners } from '@lib/dragListeners';
import { useSelectionStore } from '@lib/selectionStore';

import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BarsIcon,
  CalendarIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ClockIcon,
  CodeIcon,
  GripIcon,
  HashIcon,
  ImageIcon,
  LayoutIcon,
  LinkIcon,
  MoveIcon,
  NoteIcon,
  PlayIcon,
  RingIcon,
  SettingsIcon,
  TableIcon,
  TrashIcon,
} from '../ui/Icons';
import { InlineEdit } from '../ui/InlineEdit';
import { Menu } from '../ui/Menu';
import type { TileControls } from './BoardGrid';
import { AgendaBlock } from './blocks/AgendaBlock';
import { CalendarBlock } from './blocks/CalendarBlock';
import { CounterBlock } from './blocks/CounterBlock';
import { EmbedBlock } from './blocks/EmbedBlock';
import { ImageBlock } from './blocks/ImageBlock';
import { LinkBlock } from './blocks/LinkBlock';
import { NoteBlock } from './blocks/NoteBlock';
import { ChartBlock } from './blocks/ChartBlock';
import { OverdueBlock } from './blocks/OverdueBlock';
import { ProgressBlock } from './blocks/ProgressBlock';
import { SnippetBlock } from './blocks/SnippetBlock';
import { TableBlock } from './blocks/TableBlock';
import './BoardBlock.css';

interface BoardBlockProps {
  block: BoardList;
  /** Every panel of the board, since blocks draw on the cards of its lists. */
  panels: BoardList[];
  index: number;
  total: number;
  freshIds: string[];
  collapsed: boolean;
  onToggleCollapsed: (blockId: string) => void;
  onRename: (blockId: string, name: string) => void;
  onMove: (blockId: string, index: number) => void;
  onDelete: (blockId: string) => void;
  onSettings: (blockId: string) => void;
  onSaveNote: (blockId: string, text: string) => void;
  onSaveConfig: (blockId: string, kind: PanelKind, config: PanelConfig) => void;
  onOpenCard: (cardId: string) => void;
  readOnly?: boolean;
  /** Set when the block is a tile of the free layout, where the grip and the menu place it. */
  tile?: TileControls | null;
  inGrid?: boolean;
}

export function KindIcon({ kind, size = 16 }: { kind: PanelKind; size?: number }) {
  switch (kind) {
    case 'calendar':
      return <CalendarIcon size={size} />;
    case 'agenda':
      return <ClockIcon size={size} />;
    case 'note':
      return <NoteIcon size={size} />;
    case 'counter':
      return <HashIcon size={size} />;
    case 'image':
      return <ImageIcon size={size} />;
    case 'embed':
      return <PlayIcon size={size} />;
    case 'link':
      return <LinkIcon size={size} />;
    case 'progress':
      return <RingIcon size={size} />;
    case 'overdue':
      return <AlertIcon size={size} />;
    case 'chart':
      return <BarsIcon size={size} />;
    case 'snippet':
      return <CodeIcon size={size} />;
    case 'table':
      return <TableIcon size={size} />;
    default:
      return null;
  }
}

/**
 * A panel that is not a list of cards. It sits in the same row, moves, folds,
 * renames and deletes like a list, and draws something about the board instead.
 */
export function BoardBlock({
  block,
  panels,
  index,
  total,
  freshIds,
  collapsed,
  onToggleCollapsed,
  onRename,
  onMove,
  onDelete,
  onSettings,
  onSaveNote,
  onSaveConfig,
  onOpenCard,
  readOnly = false,
  tile = null,
  inGrid = false,
}: BoardBlockProps) {
  const headingId = useId();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: block.id,
    // Cards can be dropped on lists only, so the canvas tells blocks apart by this flag.
    data: { type: 'list', block: true },
    disabled: readOnly || (collapsed && !inGrid) ? true : inGrid ? { draggable: true } : false,
  });
  const { onKeyDown, pointer: pointerListeners } = splitDragListeners(listeners);
  const selectedPanel = useSelectionStore((state) => state.panels.includes(block.id));
  const opening = useOpening(collapsed && !inGrid);

  const style = { transform: CSS.Translate.toString(transform), transition };
  const size = (block.config as { size?: string }).size === 'wide' ? 'wide' : 'normal';

  if (collapsed && !inGrid) {
    return (
      <section
        ref={setNodeRef}
        data-panel-id={block.id}
        data-selected={selectedPanel || undefined}
        style={style}
        className="board-list board-list--collapsed board-block"
        role="group"
        data-kind={block.kind}
        aria-label={`${block.name}, ${KIND_LABEL[block.kind]}, collapsed`}
      >
        <button
          type="button"
          className="board-list__expand"
          aria-expanded={false}
          onClick={() => onToggleCollapsed(block.id)}
        >
          <ChevronsRightIcon size={16} />
          <span className="sr-only">Expand block </span>
          <span className="board-list__rail-name">{block.name}</span>{' '}
          <span className="board-block__rail-kind" aria-hidden="true">
            <KindIcon kind={block.kind} />
          </span>
        </button>
      </section>
    );
  }

  return (
    <section
      ref={setNodeRef}
      data-panel-id={block.id}
      data-selected={selectedPanel || undefined}
      style={style}
      className="board-list board-block"
      role="group"
      aria-labelledby={headingId}
      data-kind={block.kind}
      data-size={size}
      data-fresh={freshIds.includes(block.id) || undefined}
      data-dragging={isDragging || undefined}
      data-opening={opening || undefined}
    >
      <div
        className="board-list__header"
        {...(readOnly || inGrid ? {} : pointerListeners)}
        onPointerDown={tile?.onHeaderPointerDown}
      >
        {!readOnly && !inGrid && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            className="board-list__grip"
            aria-label={`Reorder block ${block.name}`}
            onKeyDown={onKeyDown}
            {...attributes}
          >
            <GripIcon size={16} />
          </button>
        )}
        {tile && (
          <button type="button" className="board-list__grip" {...tile.gripProps}>
            <MoveIcon size={16} />
          </button>
        )}
        <span className="board-block__kind" title={KIND_LABEL[block.kind]}>
          <KindIcon kind={block.kind} />
          <span className="sr-only">{KIND_LABEL[block.kind]}:</span>
        </span>
        <div className="board-list__title" id={headingId} data-drag-title>
          <InlineEdit
            as="h2"
            className="board-list__name"
            value={block.name}
            label="block name"
            readOnly={readOnly}
            onCommit={(name) => onRename(block.id, name)}
          />
        </div>
        {!inGrid && (
          <button
            type="button"
            className="board-list__fold"
            aria-expanded={true}
            aria-label={`Collapse block ${block.name}`}
            onClick={() => onToggleCollapsed(block.id)}
          >
            <ChevronsLeftIcon size={16} />
          </button>
        )}
        {!readOnly && (
          <Menu
            label={`Actions for block ${block.name}`}
            items={[
              {
                label: 'Settings…',
                icon: <SettingsIcon />,
                onSelect: () => onSettings(block.id),
              },
              ...(inGrid
                ? tile
                  ? [
                      {
                        label: 'Position and size…',
                        icon: <LayoutIcon />,
                        onSelect: tile.onPosition,
                      },
                    ]
                  : []
                : [
                    {
                      label: 'Move left',
                      icon: <ArrowLeftIcon />,
                      disabled: index === 0,
                      onSelect: () => onMove(block.id, index - 1),
                    },
                    {
                      label: 'Move right',
                      icon: <ArrowRightIcon />,
                      disabled: index === total - 1,
                      onSelect: () => onMove(block.id, index + 1),
                    },
                  ]),
              {
                label: 'Delete block',
                icon: <TrashIcon />,
                tone: 'danger',
                onSelect: () => onDelete(block.id),
              },
            ]}
          />
        )}
      </div>

      <div className="board-block__body">
        {block.kind === 'calendar' && <CalendarBlock panels={panels} onOpenCard={onOpenCard} />}
        {block.kind === 'agenda' && (
          <AgendaBlock block={block} panels={panels} onOpenCard={onOpenCard} />
        )}
        {block.kind === 'counter' && <CounterBlock block={block} panels={panels} />}
        {block.kind === 'progress' && <ProgressBlock block={block} panels={panels} />}
        {block.kind === 'overdue' && <OverdueBlock panels={panels} onOpenCard={onOpenCard} />}
        {block.kind === 'chart' && <ChartBlock block={block} panels={panels} />}
        {block.kind === 'table' && (
          <TableBlock
            block={block}
            editable={!readOnly}
            onSave={(blockId, config) => onSaveConfig(blockId, 'table', config)}
          />
        )}
        {block.kind === 'snippet' && (
          <SnippetBlock block={block} editable={!readOnly} onAddCode={onSettings} />
        )}
        {block.kind === 'image' && (
          <ImageBlock block={block} editable={!readOnly} onAddPicture={onSettings} />
        )}
        {block.kind === 'embed' && <EmbedBlock block={block} />}
        {block.kind === 'link' && <LinkBlock block={block} />}
        {block.kind === 'note' && (
          <NoteBlock
            text={noteConfig(block).text}
            editable={!readOnly}
            onSave={(text) => onSaveNote(block.id, text)}
          />
        )}
      </div>
    </section>
  );
}
