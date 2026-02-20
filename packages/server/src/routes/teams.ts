import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors.js';
import { listTeams, getTeam, createTeam, updateTeam, deleteTeam, copyTeam, VALID_COLLAB_MODES } from '../services/teams.js';
import { db, collaborationConfigs, teams, now } from '@agentcorp/db';
import { eq } from 'drizzle-orm';

function validateCreate(body: Record<string, unknown>) {
  const errors: Array<{ field: string; rule: string; message: string }> = [];
  if (!body.name || typeof body.name !== 'string' || body.name.length < 1 || body.name.length > 100) {
    errors.push({ field: 'name', rule: 'required', message: 'name 必填，1-100 字符' });
  }
  if (!body.pmEmployeeId || typeof body.pmEmployeeId !== 'string') {
    errors.push({ field: 'pmEmployeeId', rule: 'required', message: 'pmEmployeeId 必填' });
  }
  if (body.collaborationMode !== undefined) {
    if (!(VALID_COLLAB_MODES as readonly string[]).includes(body.collaborationMode as string)) {
      errors.push({ field: 'collaborationMode', rule: 'enum', message: `collaborationMode 必须是 ${VALID_COLLAB_MODES.join('/')} 之一` });
    }
  }
  if (body.memberIds !== undefined) {
    if (!Array.isArray(body.memberIds)) {
      errors.push({ field: 'memberIds', rule: 'type', message: 'memberIds 必须是数组' });
    } else if (body.memberIds.length > 50) {
      errors.push({ field: 'memberIds', rule: 'maxItems', message: '成员最多 50 个' });
    }
  }
  if (body.toolIds !== undefined) {
    if (!Array.isArray(body.toolIds)) {
      errors.push({ field: 'toolIds', rule: 'type', message: 'toolIds 必须是数组' });
    } else if (body.toolIds.length > 100) {
      errors.push({ field: 'toolIds', rule: 'maxItems', message: '工具最多 100 个' });
    }
  }
  if (errors.length > 0) {
    throw new AppError('VALIDATION_ERROR', '请求参数校验失败', { details: errors });
  }
}

function validateUpdate(body: Record<string, unknown>) {
  const errors: Array<{ field: string; rule: string; message: string }> = [];
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.length < 1 || body.name.length > 100) {
      errors.push({ field: 'name', rule: 'length', message: 'name 1-100 字符' });
    }
  }
  if (body.collaborationMode !== undefined) {
    if (!(VALID_COLLAB_MODES as readonly string[]).includes(body.collaborationMode as string)) {
      errors.push({ field: 'collaborationMode', rule: 'enum', message: `collaborationMode 必须是 ${VALID_COLLAB_MODES.join('/')} 之一` });
    }
  }
  if (body.memberIds !== undefined && !Array.isArray(body.memberIds)) {
    errors.push({ field: 'memberIds', rule: 'type', message: 'memberIds 必须是数组' });
  }
  if (body.toolIds !== undefined && !Array.isArray(body.toolIds)) {
    errors.push({ field: 'toolIds', rule: 'type', message: 'toolIds 必须是数组' });
  }
  if (errors.length > 0) {
    throw new AppError('VALIDATION_ERROR', '请求参数校验失败', { details: errors });
  }
}

export function registerTeamRoutes(app: FastifyInstance) {
  app.get('/api/teams', async () => {
    return { data: await listTeams() };
  });

  app.get<{ Params: { id: string } }>('/api/teams/:id', async (req) => {
    return { data: await getTeam(req.params.id) };
  });

  app.post<{ Body: Record<string, unknown> }>('/api/teams', async (req, reply) => {
    validateCreate(req.body);
    const data = await createTeam(req.body as any);
    return reply.status(201).send({ data });
  });

  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>('/api/teams/:id', async (req) => {
    validateUpdate(req.body);
    return { data: await updateTeam(req.params.id, req.body as any) };
  });

  app.delete<{ Params: { id: string } }>('/api/teams/:id', async (req) => {
    return { data: await deleteTeam(req.params.id) };
  });

  app.post<{ Params: { id: string } }>('/api/teams/:id/copy', async (req, reply) => {
    const data = await copyTeam(req.params.id);
    return reply.status(201).send({ data });
  });

  // Collaboration config
  app.get<{ Params: { id: string } }>('/api/teams/:id/collaboration-config', async (req) => {
    const teamId = req.params.id;
    const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId));
    if (!team) throw new AppError('NOT_FOUND', `团队 ${teamId} 不存在`);

    const [row] = await db.select().from(collaborationConfigs).where(eq(collaborationConfigs.teamId, teamId));
    let config = {};
    if (row) {
      try { config = JSON.parse(row.config); }
      catch { config = {}; }
    }
    return { data: { teamId, config } };
  });

  app.put<{ Params: { id: string }; Body: Record<string, unknown> }>('/api/teams/:id/collaboration-config', async (req) => {
    const teamId = req.params.id;
    const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId));
    if (!team) throw new AppError('NOT_FOUND', `团队 ${teamId} 不存在`);

    const config = req.body.config;
    if (config === undefined || config === null) {
      throw new AppError('VALIDATION_ERROR', 'config 字段必填');
    }

    const configStr = JSON.stringify(config);
    const timestamp = now();

    const [existing] = await db.select({ teamId: collaborationConfigs.teamId })
      .from(collaborationConfigs).where(eq(collaborationConfigs.teamId, teamId));

    if (existing) {
      await db.update(collaborationConfigs)
        .set({ config: configStr, updatedAt: timestamp })
        .where(eq(collaborationConfigs.teamId, teamId));
    } else {
      await db.insert(collaborationConfigs).values({ teamId, config: configStr, updatedAt: timestamp });
    }

    return { data: { teamId, config } };
  });
}
