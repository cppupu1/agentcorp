import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors.js';
import * as modelService from '../services/models.js';
import { triggerChangeTests } from '../services/change-testing.js';

interface ModelBody {
  name?: string;
  baseUrl?: string;
  modelId?: string;
  apiKey?: string;
  notes?: string;
}

function validateCreate(body: ModelBody) {
  const errors: Array<{ field: string; rule: string; message: string }> = [];
  if (!body.name || body.name.length < 1 || body.name.length > 100) {
    errors.push({ field: 'name', rule: 'required', message: 'name 必填，1-100 字符' });
  }
  if (!body.baseUrl) {
    errors.push({ field: 'baseUrl', rule: 'required', message: 'baseUrl 必填' });
  } else {
    try { new URL(body.baseUrl); } catch {
      errors.push({ field: 'baseUrl', rule: 'format', message: 'baseUrl 格式不合法' });
    }
  }
  if (!body.modelId || body.modelId.length < 1 || body.modelId.length > 200) {
    errors.push({ field: 'modelId', rule: 'required', message: 'modelId 必填，1-200 字符' });
  }
  if (!body.apiKey) {
    errors.push({ field: 'apiKey', rule: 'required', message: 'apiKey 必填' });
  }
  if (errors.length > 0) {
    throw new AppError('VALIDATION_ERROR', '请求参数校验失败', { details: errors });
  }
}

export function registerModelRoutes(app: FastifyInstance) {
  // List
  app.get('/api/models', async () => {
    return { data: await modelService.listModels() };
  });

  // Get by ID
  app.get<{ Params: { id: string } }>('/api/models/:id', async (req) => {
    return { data: await modelService.getModel(req.params.id) };
  });

  // Create
  app.post<{ Body: ModelBody }>('/api/models', async (req, reply) => {
    validateCreate(req.body);
    const model = await modelService.createModel(req.body as Required<Pick<ModelBody, 'name' | 'baseUrl' | 'modelId' | 'apiKey'>> & { notes?: string });
    return reply.status(201).send({ data: model });
  });

  // Update
  app.put<{ Params: { id: string }; Body: ModelBody }>('/api/models/:id', async (req) => {
    const result = await modelService.updateModel(req.params.id, req.body);
    // Fire-and-forget: trigger change tests
    triggerChangeTests('model_updated', req.params.id, { fields: Object.keys(req.body) })
      .catch(err => console.error('Change test trigger failed:', err));
    return { data: result };
  });

  // Delete
  app.delete<{ Params: { id: string } }>('/api/models/:id', async (req) => {
    return { data: await modelService.deleteModel(req.params.id) };
  });

  // Test connectivity
  app.post<{ Params: { id: string } }>('/api/models/:id/test', async (req) => {
    const model = await modelService.getModelWithKey(req.params.id);
    try {
      const { generateText } = await import('ai');
      const { createOpenAI } = await import('@ai-sdk/openai');
      const provider = createOpenAI({ apiKey: model.apiKey, baseURL: model.baseUrl });
      await (generateText as Function)({
        model: provider.chat(model.modelId),
        prompt: 'Hi',
        maxTokens: 10,
      });
      await modelService.updateModelStatus(model.id, 'available');
      return { success: true, status: 'available', message: '连接成功，模型响应正常' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await modelService.updateModelStatus(model.id, 'unavailable');
      return { success: false, status: 'unavailable', message: `连接失败：${message}` };
    }
  });
}
