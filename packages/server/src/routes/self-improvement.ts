import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors.js';
import {
  diagnoseQualityIssue, generatePromptOptimization,
  listProposals, approveProposal, rejectProposal, applyProposal,
} from '../services/self-improvement.js';

export function registerSelfImprovementRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>('/api/employees/:id/diagnose', async (req) => {
    return { data: await diagnoseQualityIssue(req.params.id) };
  });

  app.post<{ Params: { id: string }; Body: { diagnosis: any } }>(
    '/api/employees/:id/optimize-prompt', async (req) => {
      const { diagnosis } = req.body || {};
      if (!diagnosis) throw new AppError('VALIDATION_ERROR', 'diagnosis 必填');
      return { data: await generatePromptOptimization(req.params.id, diagnosis) };
    },
  );

  app.get<{ Querystring: { targetType?: string; status?: string } }>(
    '/api/improvement-proposals', async (req) => {
      return { data: await listProposals(req.query) };
    },
  );

  app.post<{ Params: { id: string } }>('/api/improvement-proposals/:id/approve', async (req) => {
    return { data: await approveProposal(req.params.id) };
  });

  app.post<{ Params: { id: string } }>('/api/improvement-proposals/:id/reject', async (req) => {
    return { data: await rejectProposal(req.params.id) };
  });

  app.post<{ Params: { id: string } }>('/api/improvement-proposals/:id/apply', async (req) => {
    return { data: await applyProposal(req.params.id) };
  });
}
