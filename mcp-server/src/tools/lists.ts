import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { LekThikClient } from '../client.js';
import type { ListWithCards } from '../types.js';
import { json, ok } from './helpers.js';

const BLOCK_KINDS = [
  'calendar',
  'agenda',
  'note',
  'counter',
  'progress',
  'overdue',
  'chart',
  'snippet',
  'table',
  'clocks',
  'timer',
] as const;

export function registerListTools(server: McpServer, client: LekThikClient): void {
  server.registerTool(
    'create_list',
    {
      title: 'Create a list of cards',
      description:
        'Adds a new, empty column of cards to a board, at the end. Use create_card afterwards ' +
        'to put cards in it.',
      inputSchema: {
        board_id: z.string().uuid().describe('The board to add the list to.'),
        name: z.string().trim().min(1).max(100).describe('The list name, e.g. "To do".'),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ board_id, name }) =>
      json(await client.request<ListWithCards>('POST', `/boards/${board_id}/lists`, { name }))
  );

  server.registerTool(
    'create_block',
    {
      title: 'Add a block to a board',
      description:
        'Adds a block beside the lists of a board: a calendar, an agenda, a note, a counter, ' +
        'a progress ring or bar, an overdue list, a chart, a code or text snippet, a small ' +
        'table, world clocks, or a focus timer. Blocks draw live from the cards of the board, ' +
        'so most need no `config` at all; leave it out for sensible defaults. For a counter, ' +
        'for example, `config` can set `{"metric": "late_cards"}` or `{"metric": "share_done"}`; ' +
        'call get_board afterwards to see exactly what was made.',
      inputSchema: {
        board_id: z.string().uuid().describe('The board to add the block to.'),
        kind: z.enum(BLOCK_KINDS).describe('Which kind of block to add.'),
        name: z.string().trim().min(1).max(100).describe('The block\'s own name, shown as its title.'),
        config: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Settings specific to the kind. Omit for the defaults; unknown settings are refused.'),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ board_id, kind, name, config }) =>
      json(await client.request('POST', `/boards/${board_id}/blocks`, { kind, name, config }))
  );

  server.registerTool(
    'rename_list',
    {
      title: 'Rename a list or a block',
      description: "Changes a list's or a block's name.",
      inputSchema: {
        list_id: z.string().uuid().describe('The id of the list or block to rename (from get_board).'),
        name: z.string().trim().min(1).max(100).describe('Its new name.'),
      },
      annotations: { idempotentHint: true, openWorldHint: false },
    },
    async ({ list_id, name }) => json(await client.request('PATCH', `/lists/${list_id}`, { name }))
  );

  server.registerTool(
    'delete_list',
    {
      title: 'Delete a list or a block',
      description:
        'Permanently deletes a list and every card in it, or a block and its settings. There ' +
        'is no undo. Ask for confirmation before calling this unless the person has already ' +
        'been explicit about wanting it gone.',
      inputSchema: {
        list_id: z.string().uuid().describe('The id of the list or block to delete (from get_board).'),
      },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ list_id }) => {
      await client.request('DELETE', `/lists/${list_id}`);
      return ok(`Deleted list or block ${list_id}.`);
    }
  );

  server.registerTool(
    'move_list',
    {
      title: 'Move a list or a block to a new position',
      description:
        "Moves a list or a block to a new index among its board's lists and blocks, left to " +
        'right, starting at 0.',
      inputSchema: {
        list_id: z.string().uuid().describe('The id of the list or block to move.'),
        index: z.number().int().min(0).describe('Its new position, 0 is the first.'),
      },
      annotations: { idempotentHint: true, openWorldHint: false },
    },
    async ({ list_id, index }) => {
      await client.request('POST', `/lists/${list_id}/move`, { index });
      return ok(`Moved ${list_id} to position ${index}.`);
    }
  );

  server.registerTool(
    'set_wip_limit',
    {
      title: "Set a list's work in progress limit",
      description:
        'Sets how many cards a list should hold before it warns, between 1 and 99, or removes ' +
        'the limit. The limit only warns, it never blocks adding another card.',
      inputSchema: {
        list_id: z.string().uuid().describe('The list to limit.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(99)
          .nullable()
          .describe('The new limit, or null to remove it. Always required, so it is never cleared by accident.'),
      },
      annotations: { idempotentHint: true, openWorldHint: false },
    },
    async ({ list_id, limit }) =>
      json(await client.request('PUT', `/lists/${list_id}/wip-limit`, { limit }))
  );
}
