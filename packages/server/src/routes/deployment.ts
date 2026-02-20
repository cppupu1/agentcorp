import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors.js';
import {
  listDeploymentStages,
  getDeploymentStage,
  createDeploymentStage,
  evaluatePromotion,
  promoteStage,
  demoteStage,
  deleteDeploymentStage,
} from '../services/deployment.js';

export function registerDeploymentRoutes(app: FastifyInstance) {
  // List all deployment stages
  app.get('/api/deployment-stages', async () => {
    return { data: await listDeploymentStages() };
  });

  // Get single deployment stage with evaluations
  app.get<{ Params: { id: string } }>('/api/deployment-stages/:id', async (req) => {
    return { data: await getDeploymentStage(req.params.id) };
  });

  // Create deployment stage
  app.post<{ Body: { employeeId: string; teamId?: string } }>('/api/deployment-stages', async (req) => {
    const { employeeId, teamId } = req.body || {};
    if (!employeeId) throw new AppError('VALIDATION_ERROR', 'employeeId 必填');
    return { data: await createDeploymentStage(employeeId, teamId) };
  });

  // Evaluate promotion
  app.post<{ Params: { id: string } }>('/api/deployment-stages/:id/evaluate', async (req) => {
    return { data: await evaluatePromotion(req.params.id) };
  });

  // Manual promote
  app.post<{ Params: { id: string } }>('/api/deployment-stages/:id/promote', async (req) => {
    return { data: await promoteStage(req.params.id) };
  });

  // Manual demote
  app.post<{ Params: { id: string } }>('/api/deployment-stages/:id/demote', async (req) => {
    return { data: await demoteStage(req.params.id) };
  });

  // Delete deployment stage
  app.delete<{ Params: { id: string } }>('/api/deployment-stages/:id', async (req) => {
    return { data: await deleteDeploymentStage(req.params.id) };
  });
}
