import type { FastifyInstance } from 'fastify';
import {
  getTaskTimeline,
  getTaskDecisionLog,
  getTaskToolTrace,
  getHealthStats,
} from '../services/observability.js';

export function registerObservabilityRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/api/tasks/:id/timeline', async (req) => {
    return { data: await getTaskTimeline(req.params.id) };
  });

  app.get<{ Params: { id: string } }>('/api/tasks/:id/decisions', async (req) => {
    return { data: await getTaskDecisionLog(req.params.id) };
  });

  app.get<{ Params: { id: string } }>('/api/tasks/:id/tool-trace', async (req) => {
    return { data: await getTaskToolTrace(req.params.id) };
  });

  app.get('/api/health/stats', async () => {
    return { data: await getHealthStats() };
  });
}
