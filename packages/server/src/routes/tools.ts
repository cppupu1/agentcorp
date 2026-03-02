import type { FastifyInstance } from 'fastify';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { AppError } from '../errors.js';
import * as toolService from '../services/tools.js';

interface ToolBody {
  name?: string;
  description?: string;
  transportType?: string;
  command?: string;
  args?: string[];
  envVars?: Record<string, string>;
  groupName?: string;
}

// Validate command is a safe npm package name (scoped or unscoped)
const SAFE_COMMAND_RE = /^(@[\w-]+\/)?[\w][\w./-]*$/;

function validateCommand(command: string): boolean {
  return SAFE_COMMAND_RE.test(command) && !command.includes('..');
}

// Blocklist dangerous HTTP headers to prevent injection
const BLOCKED_HEADERS = new Set(['host', 'transfer-encoding', 'content-length', 'connection', 'cookie', 'set-cookie']);

function sanitizeHeaders(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const lower = k.toLowerCase().trim();
    if (lower && !BLOCKED_HEADERS.has(lower) && /^[\w-]+$/.test(k)) {
      out[k.trim()] = v;
    }
  }
  return out;
}

async function validateSseUrl(raw: string): Promise<URL> {
  const parsed = new URL(raw);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError('VALIDATION_ERROR', 'SSE URL 仅支持 http/https 协议');
  }
  // SSRF protection: block private/reserved IP ranges for both literal IP and DNS-resolved IP.
  const host = parsed.hostname.toLowerCase();
  if (isPrivateHost(host)) {
    throw new AppError('VALIDATION_ERROR', '不允许访问内网地址');
  }
  if (isIP(host) === 0) {
    let resolved;
    try {
      resolved = await lookup(host, { all: true, verbatim: true });
    } catch {
      throw new AppError('VALIDATION_ERROR', 'SSE URL 主机名解析失败');
    }
    if (resolved.some(r => isPrivateIp(r.address))) {
      throw new AppError('VALIDATION_ERROR', '不允许访问解析到内网的地址');
    }
  }
  return parsed;
}

function isPrivateHost(host: string): boolean {
  if (isIP(host) !== 0) return isPrivateIp(host);
  // localhost variants
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return true;
  return false;
}

function isPrivateIp(ip: string): boolean {
  const normalized = ip.replace(/^::ffff:/, '').toLowerCase();
  const ipVersion = isIP(normalized);
  if (ipVersion === 4) return isPrivateIpv4(normalized);
  if (ipVersion === 6) {
    if (normalized === '::1') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // fc00::/7
    if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true; // fe80::/10
  }
  return false;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || !parts.every(n => !isNaN(n))) return false;
  if (parts[0] === 10) return true;                                    // 10.0.0.0/8
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
  if (parts[0] === 192 && parts[1] === 168) return true;              // 192.168.0.0/16
  if (parts[0] === 169 && parts[1] === 254) return true;              // 169.254.0.0/16
  if (parts[0] === 127) return true;                                   // 127.0.0.0/8
  return false;
}

function isLoopbackIp(ip: string): boolean {
  const normalized = ip.replace(/^::ffff:/, '');
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost';
}

function validateCreate(body: ToolBody) {
  const errors: Array<{ field: string; rule: string; message: string }> = [];
  if (!body.name || body.name.length < 1 || body.name.length > 100) {
    errors.push({ field: 'name', rule: 'required', message: 'name 必填，1-100 字符' });
  }
  if (!body.description || body.description.length < 1 || body.description.length > 5000) {
    errors.push({ field: 'description', rule: 'required', message: 'description 必填，1-5000 字符' });
  }
  if (!body.command) {
    errors.push({ field: 'command', rule: 'required', message: 'command 必填' });
  } else if (body.transportType === 'sse') {
    try { new URL(body.command); } catch {
      errors.push({ field: 'command', rule: 'format', message: 'SSE 模式下 command 必须是合法 URL' });
    }
  } else if (!validateCommand(body.command)) {
    errors.push({ field: 'command', rule: 'format', message: 'command 格式不合法，仅允许 npm 包名格式' });
  }
  if (errors.length > 0) {
    throw new AppError('VALIDATION_ERROR', '请求参数校验失败', { details: errors });
  }
}

export function registerToolRoutes(app: FastifyInstance) {
  // List
  app.get<{ Querystring: { group?: string } }>('/api/tools', async (req) => {
    return { data: await toolService.listTools(req.query.group) };
  });

  // Groups
  app.get('/api/tools/groups', async () => {
    return { data: await toolService.listGroups() };
  });

  // Probe: connect to an SSE MCP server and discover tools (without saving)
  // NOTE: stdio probe is disabled — executing arbitrary npm packages is an RCE risk
  app.post<{ Body: { url: string; transportType?: string; envVars?: Record<string, string> } }>('/api/tools/probe', async (req) => {
    const { url, transportType = 'sse', envVars = {} } = req.body;

    if (transportType !== 'sse') {
      throw new AppError('VALIDATION_ERROR', 'Probe 仅支持 SSE 类型工具，stdio 工具请直接保存后使用测试功能');
    }
    if (!url) throw new AppError('VALIDATION_ERROR', 'url 必填');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let client: any = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      const headers = sanitizeHeaders(envVars);
      const parsed = await validateSseUrl(url);
      const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js');
      const transport = new SSEClientTransport(parsed, {
        requestInit: Object.keys(headers).length > 0 ? { headers } : undefined,
        eventSourceInit: Object.keys(headers).length > 0
          ? { fetch: (input: string | URL, init?: RequestInit) => fetch(input, { ...init, headers: { ...init?.headers, ...headers } }) }
          : undefined,
      });

      client = new Client({ name: 'agentcorp-probe', version: '1.0.0' });
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('探测超时（30s）')), 30000);
      });
      await Promise.race([client.connect(transport), timeout]);
      const result = await Promise.race([client.listTools(), timeout]);
      const discovered = (result as { tools: Array<{ name: string; description?: string }> }).tools;

      return {
        success: true,
        tools: discovered.map(t => ({ name: t.name, description: t.description ?? '' })),
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, tools: [], message: `探测失败：${message}` };
    } finally {
      if (timer) clearTimeout(timer);
      try { await client?.close(); } catch { /* ignore */ }
    }
  });

  // Get by ID
  app.get<{ Params: { id: string } }>('/api/tools/:id', async (req) => {
    return { data: await toolService.getTool(req.params.id) };
  });

  // Create
  app.post<{ Body: ToolBody }>('/api/tools', async (req, reply) => {
    validateCreate(req.body);
    const tool = await toolService.createTool(req.body as Required<Pick<ToolBody, 'name' | 'description' | 'command'>> & Partial<ToolBody>);
    return reply.status(201).send({ data: tool });
  });

  // Update
  app.put<{ Params: { id: string }; Body: ToolBody }>('/api/tools/:id', async (req) => {
    return { data: await toolService.updateTool(req.params.id, req.body) };
  });

  // Delete
  app.delete<{ Params: { id: string } }>('/api/tools/:id', async (req) => {
    return { data: await toolService.deleteTool(req.params.id) };
  });

  // Toggle enabled
  app.post<{ Params: { id: string }; Body: { enabled: boolean } }>('/api/tools/:id/toggle', async (req) => {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      throw new AppError('VALIDATION_ERROR', 'enabled 必须是布尔值');
    }
    return { data: await toolService.toggleToolEnabled(req.params.id, enabled) };
  });

  // Test
  app.post<{ Params: { id: string } }>('/api/tools/:id/test', async (req) => {
    const tool = await toolService.getToolRaw(req.params.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let client: any = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      const args = tool.args ? JSON.parse(tool.args) : [];
      const envVars = tool.envVars ? JSON.parse(tool.envVars) : {};
      const transportType = tool.transportType ?? 'stdio';

      let transport;
      if (transportType === 'sse') {
        const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js');
        const parsed = await validateSseUrl(tool.command);
        const headers = sanitizeHeaders(envVars);
        transport = new SSEClientTransport(parsed, {
          requestInit: Object.keys(headers).length > 0 ? { headers } : undefined,
          eventSourceInit: Object.keys(headers).length > 0
            ? { fetch: (input: string | URL, init?: RequestInit) => fetch(input, { ...init, headers: { ...init?.headers, ...headers } }) }
            : undefined,
        });
      } else {
        // Security: stdio tool test can execute npm packages; only allow loopback requests.
        if (!isLoopbackIp(req.ip)) {
          return {
            success: false,
            status: 'untested',
            message: '出于安全考虑，stdio 工具测试仅允许本机请求',
          };
        }
        const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
        const isDirectExec = /^(uvx|uv|python3?|node)\b/.test(tool.command) || /^\.?\//.test(tool.command);
        transport = new StdioClientTransport({
          command: isDirectExec ? tool.command : 'npx',
          args: isDirectExec ? [...args] : ['-y', tool.command, ...args],
          env: { ...process.env, ...envVars } as Record<string, string>,
        });
      }

      client = new Client({ name: 'agentcorp-test', version: '1.0.0' });
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('工具测试超时（30s）')), 30000);
      });
      await Promise.race([client.connect(transport), timeout]);
      const result = await Promise.race([client.listTools(), timeout]);
      const discoveredTools = (result as { tools: Array<{ name: string; description?: string }> }).tools;

      await toolService.updateToolStatus(tool.id, 'available');
      return {
        success: true,
        status: 'available',
        tools: discoveredTools.map(t => ({ name: t.name, description: t.description })),
        message: `工具启动成功，发现 ${discoveredTools.length} 个可用工具`,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await toolService.updateToolStatus(tool.id, 'unavailable');
      return { success: false, status: 'unavailable', message: `工具测试失败：${message}` };
    } finally {
      if (timer) clearTimeout(timer);
      try { await client?.close(); } catch { /* ignore close errors */ }
    }
  });
}
