import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { LekThikClient } from '../client.js';
import type { BoardSummary, BoardView } from '../types.js';
import { json, ok } from './helpers.js';

const BACKGROUNDS = ['default', 'mist', 'sage', 'sand', 'blush', 'lilac', 'slate', 'dusk'] as const;
const ACCENTS = ['teal', 'blue', 'violet', 'rose', 'orange', 'graphite'] as const;

export function registerBoardTools(server: McpServer, client: LekThikClient): void {
  server.registerTool(
    'create_board',
    {
      title: 'Create a board',
      description:
        'Makes a new board inside a workspace, empty or already filled in from a template ' +
        "(call list_templates for the available ids). Returns the board's id, needed for " +
        'every other board, list or card tool.',
      inputSchema: {
        workspace_id: z.string().uuid().describe('The workspace to create the board in.'),
        name: z.string().trim().min(1).max(100).describe('The board name.'),
        template_id: z.string().optional().describe('A template id from list_templates.'),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ workspace_id, name, template_id }) =>
      json(
        await client.request<BoardSummary>('POST', `/workspaces/${workspace_id}/boards`, {
          name,
          template_id,
        })
      )
  );

  server.registerTool(
    'get_board',
    {
      title: 'Get a board, with everything on it',
      description:
        'The full state of one board: its lists and blocks in order, every card summary in ' +
        'each one (title, due date, labels, assignees), the board\'s labels, and its members. ' +
        'This is the one call to make to see what is already on a board before adding to it, ' +
        'and the only way to find the id of a list, a card or a label already there.',
      inputSchema: {
        board_id: z.string().uuid().describe('The board to read.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ board_id }) => json(await client.request<BoardView>('GET', `/boards/${board_id}`))
  );

  server.registerTool(
    'rename_board',
    {
      title: 'Rename a board',
      description: "Changes a board's name.",
      inputSchema: {
        board_id: z.string().uuid().describe('The board to rename.'),
        name: z.string().trim().min(1).max(100).describe('Its new name.'),
      },
      annotations: { idempotentHint: true, openWorldHint: false },
    },
    async ({ board_id, name }) => json(await client.request('PATCH', `/boards/${board_id}`, { name }))
  );

  server.registerTool(
    'delete_board',
    {
      title: 'Delete a board',
      description:
        'Permanently deletes a board and everything on it: every list, block, card and ' +
        'comment. There is no undo. Ask for confirmation before calling this unless the person ' +
        'has already been explicit about wanting it gone.',
      inputSchema: {
        board_id: z.string().uuid().describe('The board to delete.'),
      },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ board_id }) => {
      await client.request('DELETE', `/boards/${board_id}`);
      return ok(`Deleted board ${board_id}.`);
    }
  );

  server.registerTool(
    'set_board_look',
    {
      title: "Set a board's background and accent colour",
      description:
        "Changes a board's background tint and accent colour, shared with everyone who opens " +
        'it. Both are picked from a fixed set of presets, never a raw colour.',
      inputSchema: {
        board_id: z.string().uuid().describe('The board to restyle.'),
        background: z.enum(BACKGROUNDS).describe('One of the preset background tints.'),
        accent: z.enum(ACCENTS).describe('One of the preset accent colours.'),
      },
      annotations: { idempotentHint: true, openWorldHint: false },
    },
    async ({ board_id, background, accent }) =>
      json(await client.request('PUT', `/boards/${board_id}/look`, { background, accent }))
  );
}
