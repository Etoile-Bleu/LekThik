import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { LekThikClient } from '../client.js';
import type { MembersResponse } from '../types.js';
import { json } from './helpers.js';

export function registerMemberTools(server: McpServer, client: LekThikClient): void {
  server.registerTool(
    'list_members',
    {
      title: 'List the members of a workspace',
      description:
        "A workspace's members with their role, plus any pending invitations. Use this to " +
        "find a member's user id before assigning them to a card with set_card_assignees.",
      inputSchema: {
        workspace_id: z.string().uuid().describe('The workspace to list members of.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ workspace_id }) =>
      json(await client.request<MembersResponse>('GET', `/workspaces/${workspace_id}/members`))
  );

  server.registerTool(
    'invite_member',
    {
      title: 'Invite someone to a workspace',
      description:
        'Sends an email invitation to join a workspace with a role. They become a member once ' +
        'they accept it; nothing changes until then.',
      inputSchema: {
        workspace_id: z.string().uuid().describe('The workspace to invite them to.'),
        email: z.string().email().describe('Their email address.'),
        role: z.enum(['admin', 'writer', 'reader']).describe('The role they will have once they accept.'),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ workspace_id, email, role }) =>
      json(await client.request('POST', `/workspaces/${workspace_id}/invitations`, { email, role }))
  );
}
