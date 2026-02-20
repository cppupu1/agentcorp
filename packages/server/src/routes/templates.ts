import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors.js';
import { listTemplates, applyTemplate } from '../services/templates.js';

export function registerTemplateRoutes(app: FastifyInstance) {
  app.get('/api/templates', async () => {
    return { data: listTemplates() };
  });

  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/api/templates/:id/apply',
    async (req, reply) => {
      const { modelId } = req.body;
      if (!modelId || typeof modelId !== 'string') {
        throw new AppError('VALIDATION_ERROR', 'modelId 必填', {
          details: [{ field: 'modelId', rule: 'required', message: 'modelId 必填' }],
        });
      }
      const data = await applyTemplate(req.params.id, modelId);
      return reply.status(201).send({ data });
    },
  );
}
