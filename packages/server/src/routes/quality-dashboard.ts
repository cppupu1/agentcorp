import type { FastifyInstance } from 'fastify';
import { getQualityTrend, getEmployeeQualityRanking, getQualityAlerts } from '../services/quality-dashboard.js';

export function registerQualityDashboardRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { startDate?: string; endDate?: string; granularity?: string } }>(
    '/api/quality/trend', async (req) => {
      const { startDate, endDate, granularity } = req.query;
      return { data: await getQualityTrend(startDate, endDate, granularity) };
    },
  );

  app.get('/api/quality/ranking', async () => {
    return { data: await getEmployeeQualityRanking() };
  });

  app.get('/api/quality/alerts', async () => {
    return { data: await getQualityAlerts() };
  });
}
