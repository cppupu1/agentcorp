import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors.js';
import {
  listTestScenarios,
  getTestScenario,
  createTestScenario,
  updateTestScenario,
  deleteTestScenario,
  listTestRuns,
  getTestRun,
  runTests,
} from '../services/testing.js';

export function registerTestingRoutes(app: FastifyInstance) {
  // ============ Test Scenarios ============

  app.get('/api/test-scenarios', async () => {
    return { data: await listTestScenarios() };
  });

  app.get<{ Params: { id: string } }>('/api/test-scenarios/:id', async (req) => {
    return { data: await getTestScenario(req.params.id) };
  });

  app.post<{ Body: {
    name: string; description?: string; category?: string;
    input: unknown; expectedBehavior: string;
    evaluationCriteria?: unknown; tags?: string[];
  } }>('/api/test-scenarios', async (req) => {
    const body = req.body || {} as any;
    if (!body.name) throw new AppError('VALIDATION_ERROR', 'name 必填');
    if (body.input === undefined) throw new AppError('VALIDATION_ERROR', 'input 必填');
    if (!body.expectedBehavior) throw new AppError('VALIDATION_ERROR', 'expectedBehavior 必填');
    return { data: await createTestScenario(body) };
  });

  app.put<{ Params: { id: string }; Body: {
    name?: string; description?: string; category?: string;
    input?: unknown; expectedBehavior?: string;
    evaluationCriteria?: unknown; tags?: string[];
  } }>('/api/test-scenarios/:id', async (req) => {
    return { data: await updateTestScenario(req.params.id, req.body || {}) };
  });

  app.delete<{ Params: { id: string } }>('/api/test-scenarios/:id', async (req) => {
    return { data: await deleteTestScenario(req.params.id) };
  });

  // ============ Test Runs ============

  app.get<{ Querystring: { employeeId?: string } }>('/api/test-runs', async (req) => {
    return { data: await listTestRuns(req.query.employeeId) };
  });

  app.get<{ Params: { id: string } }>('/api/test-runs/:id', async (req) => {
    return { data: await getTestRun(req.params.id) };
  });

  app.post<{ Body: { employeeId: string; scenarioIds: string[] } }>('/api/test-runs', async (req) => {
    const body = req.body || {} as any;
    if (!body.employeeId) throw new AppError('VALIDATION_ERROR', 'employeeId 必填');
    if (!Array.isArray(body.scenarioIds) || body.scenarioIds.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'scenarioIds 必须是非空数组');
    }
    return { data: await runTests(body.employeeId, body.scenarioIds, 'manual') };
  });
}
