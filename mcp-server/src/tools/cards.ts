import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { LekThikClient } from '../client.js';
import type { Card } from '../types.js';
import { json, ok } from './helpers.js';

export function registerCardTools(server: McpServer, client: LekThikClient): void {
  server.registerTool(
    'create_card',
    {
      title: 'Create a card',
      description: 'Adds a new card at the end of a list, with just a title. Use update_card ' +
        'afterwards to add a description or a due date, and set_card_labels or ' +
        'set_card_assignees to label or assign it.',
      inputSchema: {
        list_id: z.string().uuid().describe('The list to add the card to (from get_board).'),
        title: z.string().trim().min(1).max(300).describe('The card title.'),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ list_id, title }) =>
      json(await client.request('POST', `/lists/${list_id}/cards`, { title }))
  );

  server.registerTool(
    'get_card',
    {
      title: 'Get a card',
      description:
        "A card's full detail: its title, description, due date, label ids and assignee ids. " +
        'Card summaries from get_board already carry most of this; reach for this tool for ' +
        'the full description text.',
      inputSchema: {
        card_id: z.string().uuid().describe('The card to read.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ card_id }) => json(await client.request<Card>('GET', `/cards/${card_id}`))
  );

  server.registerTool(
    'update_card',
    {
      title: "Change a card's title, description or due date",
      description:
        'Updates one or more of a card\'s title, Markdown description and due date in one ' +
        'call. Leave a field out to keep it as it is; send `due_date: null` to clear the due ' +
        'date, or a day written `YYYY-MM-DD` to set it.',
      inputSchema: {
        card_id: z.string().uuid().describe('The card to update.'),
        title: z.string().trim().min(1).max(300).optional().describe('A new title.'),
        description: z.string().optional().describe('A new Markdown description, replacing the old one.'),
        due_date: z
          .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
          .optional()
          .describe('A day as `YYYY-MM-DD`, or null to clear the due date. Omit to leave it as is.'),
      },
      annotations: { idempotentHint: true, openWorldHint: false },
    },
    async ({ card_id, title, description, due_date }) =>
      json(await client.request('PATCH', `/cards/${card_id}`, { title, description, due_date }))
  );

  server.registerTool(
    'move_card',
    {
      title: 'Move a card to another list or position',
      description:
        'Moves a card to a new list and position (0 is the top), or just a new position in ' +
        'its own list.',
      inputSchema: {
        card_id: z.string().uuid().describe('The card to move.'),
        list_id: z.string().uuid().describe('The list to move it into, its own list to just reorder it.'),
        index: z.number().int().min(0).describe('Its new position in that list, 0 is the top.'),
      },
      annotations: { idempotentHint: true, openWorldHint: false },
    },
    async ({ card_id, list_id, index }) => {
      await client.request('POST', `/cards/${card_id}/move`, { list_id, index });
      return ok(`Moved card ${card_id}.`);
    }
  );

  server.registerTool(
    'duplicate_card',
    {
      title: 'Duplicate a card',
      description:
        'Copies a card right after the original, with its description, due date, labels and ' +
        'assignees. Comments and history are not copied.',
      inputSchema: {
        card_id: z.string().uuid().describe('The card to duplicate.'),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ card_id }) => json(await client.request('POST', `/cards/${card_id}/duplicate`))
  );

  server.registerTool(
    'delete_card',
    {
      title: 'Delete a card',
      description: 'Permanently deletes a card, with its description, comments and history. There is no undo.',
      inputSchema: {
        card_id: z.string().uuid().describe('The card to delete.'),
      },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ card_id }) => {
      await client.request('DELETE', `/cards/${card_id}`);
      return ok(`Deleted card ${card_id}.`);
    }
  );

  server.registerTool(
    'set_card_labels',
    {
      title: "Replace a card's labels",
      description:
        'Sets the full list of labels on a card, replacing whatever it had. Send every label ' +
        'id it should keep, not just the ones to add; an empty list clears them all. Find ' +
        'label ids in get_board, or make one first with create_label.',
      inputSchema: {
        card_id: z.string().uuid().describe('The card to relabel.'),
        label_ids: z.array(z.string().uuid()).describe('Every label id the card should carry.'),
      },
      annotations: { idempotentHint: true, openWorldHint: false },
    },
    async ({ card_id, label_ids }) =>
      json(await client.request('PUT', `/cards/${card_id}/labels`, { label_ids }))
  );

  server.registerTool(
    'set_card_assignees',
    {
      title: "Replace a card's assignees",
      description:
        'Sets the full list of people assigned to a card, replacing whoever was on it. Send ' +
        'every user id it should keep, not just the ones to add; an empty list unassigns ' +
        'everyone. Find member user ids with list_members or in a board\'s members from get_board.',
      inputSchema: {
        card_id: z.string().uuid().describe('The card to reassign.'),
        user_ids: z.array(z.string().uuid()).describe('Every member id the card should be assigned to.'),
      },
      annotations: { idempotentHint: true, openWorldHint: false },
    },
    async ({ card_id, user_ids }) =>
      json(await client.request('PUT', `/cards/${card_id}/assignees`, { user_ids }))
  );

  server.registerTool(
    'set_card_blocked',
    {
      title: 'Flag a card as blocked, or clear the flag',
      description:
        'Marks a card as blocked, with an optional reason shown next to the flag, or clears ' +
        'it by sending blocked: false. Re-blocking an already blocked card keeps its original ' +
        'blocked-since time and only updates the reason.',
      inputSchema: {
        card_id: z.string().uuid().describe('The card to flag or unflag.'),
        blocked: z.boolean().describe('True to flag it as blocked, false to clear the flag.'),
        reason: z
          .string()
          .max(200)
          .optional()
          .describe('Why it is blocked. Ignored when blocked is false.'),
      },
      annotations: { idempotentHint: true, openWorldHint: false },
    },
    async ({ card_id, blocked, reason }) =>
      json(await client.request<Card>('PUT', `/cards/${card_id}/blocked`, { blocked, reason }))
  );

  server.registerTool(
    'add_card_comment',
    {
      title: 'Comment on a card',
      description: 'Posts a Markdown comment on a card, visible to everyone in the workspace at once.',
      inputSchema: {
        card_id: z.string().uuid().describe('The card to comment on.'),
        body: z.string().trim().min(1).max(5000).describe('The comment, written in Markdown.'),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ card_id, body }) => json(await client.request('POST', `/cards/${card_id}/comments`, { body }))
  );
}
