import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors.js';
import { listObserverFindings, resolveFinding } from '../services/observer.js';

const VALID_RESOLUTIONS = ['acknowledged', 'fixed', 'dismissed'];

export function registerObserverRoutes(app: FastifyInstance) {
  // List findings for a task
  app.get<{ Params: { id: string } }>('/api/tasks/:id/observer-findings', async (req) => {
    return { data: await listObserverFindings(req.params.id) };
  });

  // Resolve a finding
  app.post<{ Params: { id: string; findingId: string }; Body: { resolution: string } }>(
    '/api/tasks/:id/observer-findings/:findingId/resolve', async (req) => {
      const { resolution } = req.body || {};
      if (!resolution || !VALID_RESOLUTIONS.includes(resolution)) {
        throw new AppError('VALIDATION_ERROR', `resolution 必须是 ${VALID_RESOLUTIONS.join('|')}`);
      }
      return { data: await resolveFinding(req.params.id, req.params.findingId, resolution) };
    },
  );
}
