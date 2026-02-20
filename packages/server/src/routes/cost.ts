import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors.js';
import { getTaskCostBreakdown, getGlobalCostStats } from '../services/cost-tracker.js';
import { db, modelPricing, models, now } from '@agentcorp/db';
import { eq } from 'drizzle-orm';

export function registerCostRoutes(app: FastifyInstance) {
  // Task cost breakdown
  app.get<{ Params: { id: string } }>('/api/tasks/:id/cost', async (req) => {
    return { data: await getTaskCostBreakdown(req.params.id) };
  });

  // Global cost stats
  app.get<{ Querystring: { startDate?: string; endDate?: string } }>('/api/cost/stats', async (req) => {
    return { data: await getGlobalCostStats(req.query.startDate, req.query.endDate) };
  });

  // Update model pricing
  app.put<{ Params: { id: string }; Body: { inputPricePerMToken: number; outputPricePerMToken: number } }>(
    '/api/models/:id/pricing', async (req) => {
      const { id } = req.params;
      const { inputPricePerMToken, outputPricePerMToken } = req.body;

      if (typeof inputPricePerMToken !== 'number' || typeof outputPricePerMToken !== 'number') {
        throw new AppError('VALIDATION_ERROR', 'inputPricePerMToken 和 outputPricePerMToken 必须是数字');
      }

      // Verify model exists
      const [model] = await db.select({ id: models.id }).from(models).where(eq(models.id, id));
      if (!model) throw new AppError('NOT_FOUND', `模型 ${id} 不存在`);

      // Upsert pricing
      const [existing] = await db.select().from(modelPricing).where(eq(modelPricing.modelId, id));
      if (existing) {
        await db.update(modelPricing).set({
          inputPricePerMToken: Math.round(inputPricePerMToken),
          outputPricePerMToken: Math.round(outputPricePerMToken),
          updatedAt: now(),
        }).where(eq(modelPricing.modelId, id));
      } else {
        await db.insert(modelPricing).values({
          modelId: id,
          inputPricePerMToken: Math.round(inputPricePerMToken),
          outputPricePerMToken: Math.round(outputPricePerMToken),
          updatedAt: now(),
        });
      }

      return { data: { modelId: id } };
    },
  );
}
