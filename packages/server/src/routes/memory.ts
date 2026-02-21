import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors.js';
import {
  extractMemoriesFromTask, getEmployeeMemories, getTeamMemories,
  retrieveRelevantMemories, updateMemory, deleteMemory,
} from '../services/memory.js';

export function registerMemoryRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string }; Querystring: { type?: string; search?: string } }>(
    '/api/employees/:id/memories', async (req) => {
      return { data: await getEmployeeMemories(req.params.id, req.query) };
    },
  );

  app.get<{ Params: { id: string }; Querystring: { type?: string } }>(
    '/api/teams/:id/memories', async (req) => {
      return { data: await getTeamMemories(req.params.id, req.query) };
    },
  );

  app.post<{ Params: { id: string } }>('/api/tasks/:id/extract-memories', async (req) => {
    return { data: await extractMemoriesFromTask(req.params.id) };
  });

  app.post<{ Params: { id: string }; Body: { taskDescription: string } }>(
    '/api/employees/:id/memories/retrieve', async (req) => {
      const { taskDescription } = req.body || {};
      if (!taskDescription) throw new AppError('VALIDATION_ERROR', 'taskDescription 必填');
      return { data: await retrieveRelevantMemories(req.params.id, taskDescription) };
    },
  );

  app.put<{ Params: { id: string }; Body: { summary?: string; detail?: string; tags?: string[] } }>(
    '/api/employee-memories/:id', async (req) => {
      return { data: await updateMemory(req.params.id, 'employee', req.body || {}) };
    },
  );

  app.delete<{ Params: { id: string } }>('/api/employee-memories/:id', async (req) => {
    return { data: await deleteMemory(req.params.id, 'employee') };
  });

  app.put<{ Params: { id: string }; Body: { summary?: string; detail?: string; tags?: string[] } }>(
    '/api/team-memories/:id', async (req) => {
      return { data: await updateMemory(req.params.id, 'team', req.body || {}) };
    },
  );

  app.delete<{ Params: { id: string } }>('/api/team-memories/:id', async (req) => {
    return { data: await deleteMemory(req.params.id, 'team') };
  });
}
