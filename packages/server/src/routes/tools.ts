import type { FastifyInstance } from 'fastify';
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

  // Test
  app.post<{ Params: { id: string } }>('/api/tools/:id/test', async (req) => {
    const tool = await toolService.getToolRaw(req.params.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let client: any = null;
    try {
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
      const args = tool.args ? JSON.parse(tool.args) : [];
      const envVars = tool.envVars ? JSON.parse(tool.envVars) : {};
      const transportType = tool.transportType ?? 'stdio';

      let transport;
      if (transportType === 'sse') {
        const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js');
        const url = new URL(tool.command);
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(envVars)) {
          headers[k] = v as string;
        }
        transport = new SSEClientTransport(url, {
          requestInit: Object.keys(headers).length > 0 ? { headers } : undefined,
          eventSourceInit: Object.keys(headers).length > 0
            ? { fetch: (input: string | URL, init?: RequestInit) => fetch(input, { ...init, headers: { ...init?.headers, ...headers } }) }
            : undefined,
        });
      } else {
        const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
        transport = new StdioClientTransport({
          command: 'npx',
          args: ['-y', tool.command, ...args],
          env: { ...process.env, ...envVars } as Record<string, string>,
        });
      }

      client = new Client({ name: 'agentcorp-test', version: '1.0.0' });

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('工具测试超时（30s）')), 30000)
      );
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
      try { await client?.close(); } catch { /* ignore close errors */ }
    }
  });
}
