import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { LekThikClient } from '../client.js';
import type { CurrentUser, Templates, WorkspaceWithBoards } from '../types.js';
import { json } from './helpers.js';

export function registerWorkspaceTools(server: McpServer, client: LekThikClient): void {
  server.registerTool(
    'whoami',
    {
      title: 'Who am I signed in as',
      description:
        'Returns the LekThik account these tools are acting as: its id, email and username. ' +
        'Use this once at the start of a session to confirm which account is about to be changed.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => json(await client.request<CurrentUser>('GET', '/users/me'))
  );

  server.registerTool(
    'list_workspaces',
    {
      title: 'List my workspaces',
      description:
        'Every workspace the signed in account belongs to, with its own role in each one ' +
        '(owner, admin, writer or reader) and the boards it holds. Call this first to find a ' +
        "workspace's id before creating a board in it, or to see what already exists.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => json(await client.request<WorkspaceWithBoards[]>('GET', '/workspaces'))
  );

  server.registerTool(
    'create_workspace',
    {
      title: 'Create a workspace',
      description:
        'Makes a new, empty workspace, or one already filled in from a template (call ' +
        'list_templates first to see the available `template_id`s, such as "sprint-planning"). ' +
        'The signed in account becomes its owner. Returns the new workspace, with its id.',
      inputSchema: {
        name: z.string().trim().min(1).max(100).describe('The workspace name, shown in the sidebar.'),
        template_id: z
          .string()
          .optional()
          .describe('A template id from list_templates, to start with its boards already set up.'),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ name, template_id }) =>
      json(await client.request('POST', '/workspaces', { name, template_id }))
  );

  server.registerTool(
    'rename_workspace',
    {
      title: 'Rename a workspace',
      description: 'Changes a workspace\'s name. Only its owner or an admin can do this.',
      inputSchema: {
        workspace_id: z.string().uuid().describe('The workspace to rename.'),
        name: z.string().trim().min(1).max(100).describe('Its new name.'),
      },
      annotations: { idempotentHint: true, openWorldHint: false },
    },
    async ({ workspace_id, name }) =>
      json(await client.request('PATCH', `/workspaces/${workspace_id}`, { name }))
  );

  server.registerTool(
    'delete_workspace',
    {
      title: 'Delete a workspace',
      description:
        'Permanently deletes a workspace and everything in it: every board, list, card, label ' +
        'and comment. Only its owner can do this, and there is no undo. Ask for confirmation ' +
        'before calling this unless the person has already been explicit about wanting it gone.',
      inputSchema: {
        workspace_id: z.string().uuid().describe('The workspace to delete.'),
      },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ workspace_id }) => {
      await client.request('DELETE', `/workspaces/${workspace_id}`);
      return json({ deleted: workspace_id });
    }
  );

  server.registerTool(
    'list_templates',
    {
      title: 'List the ready made templates',
      description:
        'The workspace and board templates LekThik ships with (sprint planning, a bug tracker, ' +
        'a content calendar and more), each with the id to pass as `template_id` to ' +
        'create_workspace or create_board. Call this before offering someone a template by name.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => json(await client.request<Templates>('GET', '/templates'))
  );
}
