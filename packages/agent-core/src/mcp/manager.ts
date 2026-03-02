import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { MCPToolConfig } from '../agent/types.js';
import type { MCPToolInfo } from './types.js';

const SAFE_COMMAND_RE = /^(@[\w-]+\/)?[\w][\w./-]*$/;
const SAFE_ARG_RE = /^[a-zA-Z0-9_./:@=, -]+$/;
function parseTimeout(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const CONNECT_TIMEOUT_MS = parseTimeout(process.env.MCP_CONNECT_TIMEOUT_MS, 10_000);
const CALL_TIMEOUT_MS = parseTimeout(process.env.MCP_CALL_TIMEOUT_MS, 60_000);
const CLOSE_TIMEOUT_MS = 5_000;
const TOOL_RESULT_MAX_CHARS = 30_000;
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
      // Non-npm executables (uvx, python, node, paths) run directly; npm packages use npx
      const isDirectExec = /^(uvx|uv|python3?|node)\b/.test(config.command) || /^\.?\//.test(config.command);
      transport = new StdioClientTransport({
        command: isDirectExec ? config.command : 'npx',
        args: isDirectExec ? [...config.args] : ['-y', config.command, ...config.args],
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
    const raw = textParts || JSON.stringify(result.content);

    // Truncate oversized tool results to prevent context window explosion
    if (raw.length > TOOL_RESULT_MAX_CHARS) {
      const truncated = raw.slice(0, TOOL_RESULT_MAX_CHARS);
      return `${truncated}\n\n[内容已截断：原始长度 ${raw.length} 字符，已保留前 ${TOOL_RESULT_MAX_CHARS} 字符。请基于已有内容进行分析，避免重复获取同一页面。]`;
    }
    return raw;
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
      try {
        await withTimeout(Promise.resolve(conn.client.close()), CLOSE_TIMEOUT_MS, 'MCP client close');
      } catch {
        /* ignore */
      }
      try {
        await withTimeout(Promise.resolve(conn.transport.close()), CLOSE_TIMEOUT_MS, 'MCP transport close');
      } catch {
        /* ignore */
      }
    }
  }
}
