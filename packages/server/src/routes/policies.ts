import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors.js';
import {
  listPolicyPackages,
  getPolicyPackage,
  createPolicyPackage,
  updatePolicyPackage,
  deletePolicyPackage,
  createPolicyVersion,
  activateVersion,
  getTeamPolicies,
  assignPolicyToTeam,
  removePolicyFromTeam,
} from '../services/policies.js';

export function registerPolicyRoutes(app: FastifyInstance) {
  // List all policy packages
  app.get('/api/policies', async () => {
    return { data: await listPolicyPackages() };
  });

  // Get single package with versions
  app.get<{ Params: { id: string } }>('/api/policies/:id', async (req) => {
    return { data: await getPolicyPackage(req.params.id) };
  });

  // Create package
  app.post<{ Body: Record<string, unknown> }>('/api/policies', async (req, reply) => {
    const body = req.body;
    const errors: Array<{ field: string; rule: string; message: string }> = [];
    if (!body.name || typeof body.name !== 'string' || body.name.length < 1) {
      errors.push({ field: 'name', rule: 'required', message: 'name 必填' });
    }
    if (!body.rules || !Array.isArray(body.rules)) {
      errors.push({ field: 'rules', rule: 'required', message: 'rules 必填且为数组' });
    }
    if (errors.length > 0) {
      throw new AppError('VALIDATION_ERROR', '请求参数校验失败', { details: errors });
    }
    const data = await createPolicyPackage(body as any);
    return reply.status(201).send({ data });
  });

  // Update package metadata
  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>('/api/policies/:id', async (req) => {
    return { data: await updatePolicyPackage(req.params.id, req.body as any) };
  });

  // Delete package
  app.delete<{ Params: { id: string } }>('/api/policies/:id', async (req) => {
    return { data: await deletePolicyPackage(req.params.id) };
  });

  // Create new version
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>('/api/policies/:id/versions', async (req, reply) => {
    const body = req.body;
    if (!body.rules || !Array.isArray(body.rules)) {
      throw new AppError('VALIDATION_ERROR', 'rules 必填且为数组');
    }
    const data = await createPolicyVersion(
      req.params.id,
      body.rules as unknown[],
      body.changelog as string | undefined,
    );
    return reply.status(201).send({ data });
  });

  // Activate version
  app.post<{ Params: { id: string; versionId: string } }>(
    '/api/policies/:id/versions/:versionId/activate',
    async (req) => {
      return { data: await activateVersion(req.params.id, req.params.versionId) };
    },
  );

  // Team policy routes
  app.get<{ Params: { teamId: string } }>('/api/teams/:teamId/policies', async (req) => {
    return { data: await getTeamPolicies(req.params.teamId) };
  });

  app.post<{ Params: { teamId: string }; Body: Record<string, unknown> }>(
    '/api/teams/:teamId/policies',
    async (req, reply) => {
      const { packageId } = req.body;
      if (!packageId || typeof packageId !== 'string') {
        throw new AppError('VALIDATION_ERROR', 'packageId 必填');
      }
      const data = await assignPolicyToTeam(req.params.teamId, packageId as string);
      return reply.status(201).send({ data });
    },
  );

  app.delete<{ Params: { teamId: string; packageId: string } }>(
    '/api/teams/:teamId/policies/:packageId',
    async (req) => {
      return { data: await removePolicyFromTeam(req.params.teamId, req.params.packageId) };
    },
  );
}
