import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors.js';
import {
  listTriggers,
  getTrigger,
  createTrigger,
  updateTrigger,
  deleteTrigger,
  fireTrigger,
  handleWebhookTrigger,
} from '../services/triggers.js';

function validateCreate(body: Record<string, unknown>) {
  const errors: Array<{ field: string; rule: string; message: string }> = [];
  if (!body.name || typeof body.name !== 'string' || (body.name as string).length < 1) {
    errors.push({ field: 'name', rule: 'required', message: 'name 必填' });
  }
  if (!body.type || !['cron', 'webhook', 'event'].includes(body.type as string)) {
    errors.push({ field: 'type', rule: 'enum', message: 'type 必须是 cron/webhook/event 之一' });
  }
  if (!body.teamId || typeof body.teamId !== 'string') {
    errors.push({ field: 'teamId', rule: 'required', message: 'teamId 必填' });
  }
  if (!body.taskTemplate || typeof body.taskTemplate !== 'object') {
    errors.push({ field: 'taskTemplate', rule: 'required', message: 'taskTemplate 必填' });
  }
  if (errors.length > 0) {
    throw new AppError('VALIDATION_ERROR', '请求参数校验失败', { details: errors });
  }
}

export function registerTriggerRoutes(app: FastifyInstance) {
  app.get('/api/triggers', async () => {
    return { data: await listTriggers() };
  });

  app.get<{ Params: { id: string } }>('/api/triggers/:id', async (req) => {
    return { data: await getTrigger(req.params.id) };
  });

  app.post<{ Body: Record<string, unknown> }>('/api/triggers', async (req, reply) => {
    validateCreate(req.body);
    const data = await createTrigger(req.body as any);
    return reply.status(201).send({ data });
  });

  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>('/api/triggers/:id', async (req) => {
    return { data: await updateTrigger(req.params.id, req.body as any) };
  });

  app.delete<{ Params: { id: string } }>('/api/triggers/:id', async (req) => {
    return { data: await deleteTrigger(req.params.id) };
  });

  app.post<{ Params: { id: string } }>('/api/triggers/:id/fire', async (req) => {
    return { data: await fireTrigger(req.params.id) };
  });

  // Webhook endpoint
  app.post<{ Params: { path: string } }>('/api/webhooks/:path', async (req) => {
    const secret = req.headers['x-webhook-secret'] as string | undefined;
    return { data: await handleWebhookTrigger(req.params.path, secret) };
  });
}
