import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** Every tool below returns its result as one block of readable JSON; errors are left to throw
 * and are turned into a proper tool error by the SDK itself. */
export function json(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function ok(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }] };
}
