import { tool, jsonSchema } from 'ai';
import type { ToolSet } from 'ai';
import type { MCPManager } from './manager.js';

/**
 * Bridge MCP tools to AI SDK ToolSet format.
 * Tool names are prefixed with `{configId}__` to avoid conflicts between MCP servers.
 */
export function bridgeMCPTools(mcpManager: MCPManager): ToolSet {
  const tools: ToolSet = {};

  for (const { configId, tools: mcpTools } of mcpManager.getAllMCPTools()) {
    for (const mcpTool of mcpTools) {
      const toolName = `${configId}__${mcpTool.name}`;

      if (tools[toolName]) {
        console.warn(`MCP tool name collision: "${toolName}" already registered, overwriting`);
      }

      tools[toolName] = tool<unknown, string>({
        description: mcpTool.description || '',
        inputSchema: jsonSchema(
          mcpTool.inputSchema || { type: 'object' as const, properties: {} }
        ),
        execute: async (args) => {
          return await mcpManager.callTool(configId, mcpTool.name, args as Record<string, unknown>);
        },
      });
    }
  }

  return tools;
}
