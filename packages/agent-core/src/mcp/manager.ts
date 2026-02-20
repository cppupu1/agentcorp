import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { MCPToolConfig } from '../agent/types.js';
import type { MCPToolInfo } from './types.js';

const SAFE_COMMAND_RE = /^(@[\w-]+\/)?[\w][\w./-]*$/;
const SAFE_ARG_RE = /^[a-zA-Z0-9_./:@=, -]+$/;
const CONNECT_TIMEOUT_MS = 30_000;
const CALL_TIMEOUT_MS = 60_000;
const RESERVED_ENV_KEYS = new Set(['PATH', 'HOME', 'NODE_ENV']);

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

interface MCPConnection {
  config: MCPToolConfig;
  client: Client;
  transport: StdioClientTransport | SSEClientTransport;
  mcpTools: MCPToolInfo[];
}

export class MCPManager {
  private connections: Map<string, MCPConnection> = new Map();

  async connect(config: MCPToolConfig): Promise<void> {
    let transport: StdioClientTransport | SSEClientTransport;

    if (config.transportType === 'sse') {
      // SSE transport: command is the URL, envVars may contain auth headers
      const url = new URL(config.command);
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(config.envVars)) {
        headers[k] = v;
      }
      transport = new SSEClientTransport(url, {
        requestInit: Object.keys(headers).length > 0 ? { headers } : undefined,
        eventSourceInit: Object.keys(headers).length > 0
          ? { fetch: (input: string | URL, init?: RequestInit) => fetch(input, { ...init, headers: { ...init?.headers, ...headers } }) }
          : undefined,
      });
    } else {
      // Stdio transport (default)
      if (!SAFE_COMMAND_RE.test(config.command)) {
        throw new Error(`Invalid MCP command name: ${config.command}`);
      }
      for (const arg of config.args) {
        if (!SAFE_ARG_RE.test(arg)) {
          throw new Error(`Invalid MCP argument: ${arg}`);
        }
      }
      const userEnv: Record<string, string> = {};
      for (const [k, v] of Object.entries(config.envVars)) {
        if (!RESERVED_ENV_KEYS.has(k)) userEnv[k] = v;
      }
      transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', config.command, ...config.args],
        env: {
          PATH: process.env.PATH || '',
          HOME: process.env.HOME || '',
          NODE_ENV: process.env.NODE_ENV || 'production',
          ...userEnv,
        } as Record<string, string>,
      });
    }

    const client = new Client({
      name: 'agentcorp',
      version: '1.0.0',
    });

    await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, 'MCP connect');
    const { tools } = await withTimeout(client.listTools(), CONNECT_TIMEOUT_MS, 'MCP listTools');

    this.connections.set(config.id, {
      config,
      client,
      transport,
      mcpTools: tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as Record<string, unknown> | undefined,
      })),
    });
  }

  async callTool(configId: string, toolName: string, args: Record<string, unknown>): Promise<string> {
    const conn = this.connections.get(configId);
    if (!conn) throw new Error(`MCP connection not found: ${configId}`);

    const result = await withTimeout(
      conn.client.callTool({ name: toolName, arguments: args }),
      CALL_TIMEOUT_MS,
      `MCP callTool ${toolName}`,
    );

    // Extract text content for cleaner LLM consumption
    const content = result.content as Array<{ type: string; text?: string }>;
    const textParts = content
      .filter(c => c.type === 'text' && c.text)
      .map(c => c.text)
      .join('\n');
    return textParts || JSON.stringify(result.content);
  }

  getAllMCPTools(): Array<{ configId: string; tools: MCPToolInfo[] }> {
    return Array.from(this.connections.entries()).map(([id, conn]) => ({
      configId: id,
      tools: conn.mcpTools,
    }));
  }

  async closeAll(): Promise<void> {
    const snapshot = Array.from(this.connections.values());
    this.connections.clear();

    for (const conn of snapshot) {
      try { await conn.client.close(); } catch { /* ignore */ }
      try { await conn.transport.close(); } catch { /* ignore */ }
    }
  }
}
