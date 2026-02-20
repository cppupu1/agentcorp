import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors.js';
import * as webhookConfigService from '../services/webhook-configs.js';

interface WebhookBody {
  name?: string;
  url?: string;
  secret?: string;
  events?: string[];
  enabled?: boolean;
}

function validateCreate(body: WebhookBody) {
  const errors: Array<{ field: string; rule: string; message: string }> = [];
  if (!body.name || body.name.length < 1) {
    errors.push({ field: 'name', rule: 'required', message: 'name 必填' });
  }
  if (!body.url) {
    errors.push({ field: 'url', rule: 'required', message: 'url 必填' });
  } else {
    try { new URL(body.url); } catch {
      errors.push({ field: 'url', rule: 'format', message: 'url 格式不合法' });
    }
  }
  if (!body.events || !Array.isArray(body.events) || body.events.length === 0) {
    errors.push({ field: 'events', rule: 'required', message: 'events 必填且不能为空' });
  }
  if (errors.length > 0) {
    throw new AppError('VALIDATION_ERROR', '请求参数校验失败', { details: errors });
  }
}

export function registerWebhookConfigRoutes(app: FastifyInstance) {
  // List
  app.get('/api/webhook-configs', async () => {
    return { data: await webhookConfigService.listWebhookConfigs() };
  });

  // Create
  app.post<{ Body: WebhookBody }>('/api/webhook-configs', async (req, reply) => {
    validateCreate(req.body);
    const config = await webhookConfigService.createWebhookConfig(req.body as Required<Pick<WebhookBody, 'name' | 'url' | 'events'>> & { secret?: string; enabled?: boolean });
    return reply.status(201).send({ data: config });
  });

  // Update
  app.put<{ Params: { id: string }; Body: WebhookBody }>('/api/webhook-configs/:id', async (req) => {
    if (req.body.url !== undefined) {
      try { new URL(req.body.url); } catch {
        throw new AppError('VALIDATION_ERROR', '请求参数校验失败', {
          details: [{ field: 'url', rule: 'format', message: 'url 格式不合法' }],
        });
      }
    }
    return { data: await webhookConfigService.updateWebhookConfig(req.params.id, req.body) };
  });

  // Delete
  app.delete<{ Params: { id: string } }>('/api/webhook-configs/:id', async (req) => {
    return { data: await webhookConfigService.deleteWebhookConfig(req.params.id) };
  });
}
