#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { LekThikClient } from './client.js';
import { registerBoardTools } from './tools/boards.js';
import { registerCardTools } from './tools/cards.js';
import { registerLabelTools } from './tools/labels.js';
import { registerListTools } from './tools/lists.js';
import { registerMemberTools } from './tools/members.js';
import { registerWorkspaceTools } from './tools/workspaces.js';

const server = new McpServer({
  name: 'lekthik',
  version: '1.0.0',
  title: 'LekThik',
  description: 'Create and edit workspaces, boards, lists, blocks, cards and labels in your own LekThik account.',
});

const client = new LekThikClient();

registerWorkspaceTools(server, client);
registerBoardTools(server, client);
registerListTools(server, client);
registerCardTools(server, client);
registerLabelTools(server, client);
registerMemberTools(server, client);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Nothing may touch stdout past this point: it is the MCP channel. Status goes to stderr.
  console.error('LekThik MCP server ready, signed in as', process.env.LEKTHIK_EMAIL);
}

main().catch((error: unknown) => {
  console.error('LekThik MCP server failed to start:', error);
  process.exit(1);
});
