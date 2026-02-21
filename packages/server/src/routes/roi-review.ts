import type { FastifyInstance } from 'fastify';
import {
  getTaskCostReview, getCostTrend,
  computeEmployeeCompetency, getEmployeeCompetencyHistory,
  getTeamEffectiveness,
} from '../services/roi-review.js';

export function registerRoiReviewRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/api/tasks/:id/cost-review', async (req) => {
    return { data: await getTaskCostReview(req.params.id) };
  });

  app.get<{ Querystring: { startDate?: string; endDate?: string; granularity?: string } }>(
    '/api/roi/cost-trend', async (req) => {
      const { startDate, endDate, granularity } = req.query;
      return { data: await getCostTrend(startDate, endDate, granularity) };
    },
  );

  app.post<{ Params: { id: string }; Body: { period?: string } }>(
    '/api/employees/:id/compute-competency', async (req) => {
      return { data: await computeEmployeeCompetency(req.params.id, req.body?.period) };
    },
  );

  app.get<{ Params: { id: string } }>('/api/employees/:id/competency-history', async (req) => {
    return { data: await getEmployeeCompetencyHistory(req.params.id) };
  });

  app.get<{ Params: { id: string } }>('/api/teams/:id/effectiveness', async (req) => {
    return { data: await getTeamEffectiveness(req.params.id) };
  });
}
