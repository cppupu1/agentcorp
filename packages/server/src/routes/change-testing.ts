import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors.js';
import {
  listChangeTestConfigs,
  getChangeTestConfig,
  createChangeTestConfig,
  updateChangeTestConfig,
  deleteChangeTestConfig,
} from '../services/change-testing.js';

interface ConfigBody {
  name?: string;
  watchTarget?: string;
  watchId?: string | null;
  scenarioIds?: string[];
  enabled?: boolean;
}

function validateCreate(body: ConfigBody) {
  const errors: Array<{ field: string; rule: string; message: string }> = [];
  if (!body.name || body.name.length < 1 || body.name.length > 100) {
    errors.push({ field: 'name', rule: 'required', message: 'name 必填，1-100 字符' });
  }
  if (!body.watchTarget || !['employee', 'model', 'tool', 'prompt'].includes(body.watchTarget)) {
    errors.push({ field: 'watchTarget', rule: 'enum', message: 'watchTarget 必须是 employee/model/tool/prompt 之一' });
  }
  if (!body.scenarioIds || !Array.isArray(body.scenarioIds) || body.scenarioIds.length === 0) {
    errors.push({ field: 'scenarioIds', rule: 'required', message: 'scenarioIds 必填且不能为空' });
  }
  if (errors.length > 0) {
    throw new AppError('VALIDATION_ERROR', '请求参数校验失败', { details: errors });
  }
}

export function registerChangeTestingRoutes(app: FastifyInstance) {
  app.get('/api/change-test-configs', async () => {
    return { data: await listChangeTestConfigs() };
  });

  app.get<{ Params: { id: string } }>('/api/change-test-configs/:id', async (req) => {
    return { data: await getChangeTestConfig(req.params.id) };
  });

  app.post<{ Body: ConfigBody }>('/api/change-test-configs', async (req, reply) => {
    validateCreate(req.body);
    const data = await createChangeTestConfig(req.body as any);
    return reply.status(201).send({ data });
  });

  app.put<{ Params: { id: string }; Body: ConfigBody }>('/api/change-test-configs/:id', async (req) => {
    return { data: await updateChangeTestConfig(req.params.id, req.body as any) };
  });

  app.delete<{ Params: { id: string } }>('/api/change-test-configs/:id', async (req) => {
    return { data: await deleteChangeTestConfig(req.params.id) };
  });
}
