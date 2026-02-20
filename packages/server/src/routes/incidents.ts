import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors.js';
import {
  createIncidentReport,
  getIncidentReport,
  listIncidentReports,
  updateIncidentReport,
  analyzeIncident,
  deleteIncidentReport,
} from '../services/incidents.js';

export function registerIncidentRoutes(app: FastifyInstance) {
  // List all incident reports
  app.get('/api/incidents', async () => {
    return { data: await listIncidentReports() };
  });

  // Get single incident report
  app.get<{ Params: { id: string } }>('/api/incidents/:id', async (req) => {
    return { data: await getIncidentReport(req.params.id) };
  });

  // Create incident report
  app.post<{ Body: { taskId: string; triggerType: string } }>('/api/incidents', async (req) => {
    const { taskId, triggerType } = req.body || {};
    if (!taskId) throw new AppError('VALIDATION_ERROR', 'taskId 必填');
    if (!triggerType) throw new AppError('VALIDATION_ERROR', 'triggerType 必填');
    return { data: await createIncidentReport(taskId, triggerType) };
  });

  // Update incident report
  app.put<{ Params: { id: string }; Body: { rootCause?: string; impact?: string; resolution?: string; preventionPlan?: string } }>(
    '/api/incidents/:id', async (req) => {
      return { data: await updateIncidentReport(req.params.id, req.body || {}) };
    },
  );

  // Trigger AI analysis
  app.post<{ Params: { id: string } }>('/api/incidents/:id/analyze', async (req) => {
    return { data: await analyzeIncident(req.params.id) };
  });

  // Delete incident report
  app.delete<{ Params: { id: string } }>('/api/incidents/:id', async (req) => {
    return { data: await deleteIncidentReport(req.params.id) };
  });
}
