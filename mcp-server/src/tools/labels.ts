import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { LekThikClient } from '../client.js';
import type { Label } from '../types.js';
import { json, ok } from './helpers.js';

const COLORS = ['slate', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink'] as const;
const PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const;

export function registerLabelTools(server: McpServer, client: LekThikClient): void {
  server.registerTool(
    'create_label',
    {
      title: 'Create a label',
      description:
        'Adds a new, coloured label to a board, which can then be put on cards with ' +
        'set_card_labels. A priority of anything but "none" also sorts and marks the label as ' +
        'that priority wherever labels are shown.',
      inputSchema: {
        board_id: z.string().uuid().describe('The board to add the label to.'),
        name: z.string().trim().min(1).max(40).describe('The label text, e.g. "Bug" or "Needs review".'),
        color: z.enum(COLORS).describe('One of the preset colours.'),
        priority: z.enum(PRIORITIES).describe('"none" for a plain label, or a priority level.'),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ board_id, name, color, priority }) =>
      json(await client.request<Label>('POST', `/boards/${board_id}/labels`, { name, color, priority }))
  );

  server.registerTool(
    'update_label',
    {
      title: "Rename or recolour a label",
      description: "Changes a label's name, colour or priority. Leave a field out to keep it as it is.",
      inputSchema: {
        label_id: z.string().uuid().describe('The label to change (from get_board).'),
        name: z.string().trim().min(1).max(40).optional().describe('A new name.'),
        color: z.enum(COLORS).optional().describe('A new colour.'),
        priority: z.enum(PRIORITIES).optional().describe('A new priority.'),
      },
      annotations: { idempotentHint: true, openWorldHint: false },
    },
    async ({ label_id, name, color, priority }) =>
      json(await client.request('PATCH', `/labels/${label_id}`, { name, color, priority }))
  );

  server.registerTool(
    'delete_label',
    {
      title: 'Delete a label',
      description: 'Permanently deletes a label and removes it from every card that carried it.',
      inputSchema: {
        label_id: z.string().uuid().describe('The label to delete.'),
      },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ label_id }) => {
      await client.request('DELETE', `/labels/${label_id}`);
      return ok(`Deleted label ${label_id}.`);
    }
  );
}
