import type { FastifyInstance } from 'fastify';
import { getTaskEvidence, getEvidenceChainSummary } from '../services/evidence.js';

export function registerEvidenceRoutes(app: FastifyInstance) {
  // List all evidence for a task
  app.get<{ Params: { id: string } }>('/api/tasks/:id/evidence', async (req) => {
    return { data: await getTaskEvidence(req.params.id) };
  });

  // Get evidence chain summary
  app.get<{ Params: { id: string } }>('/api/tasks/:id/evidence/summary', async (req) => {
    return { data: await getEvidenceChainSummary(req.params.id) };
  });
}
