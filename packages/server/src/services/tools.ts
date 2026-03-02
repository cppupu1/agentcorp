import { db, tools, employeeTools, teamTools, employees, teams, generateId, now } from '@agentcorp/db';
import { eq, inArray } from 'drizzle-orm';
import { AppError } from '../errors.js';

// Omit envVars value from response, parse args JSON
function omitEnvVars(tool: typeof tools.$inferSelect) {
  const { envVars, ...rest } = tool;
  return { ...rest, args: safeParseArray(rest.args) };
}

// For detail view: return env var keys only
function withEnvKeys(tool: typeof tools.$inferSelect) {
  const { envVars, ...rest } = tool;
  const envKeys = envVars ? Object.keys(safeParseObj(envVars)) : [];
  return { ...rest, args: safeParseArray(rest.args), envKeys };
}

function safeParseArray(json: string | null): string[] {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}

function safeParseObj(json: string): Record<string, string> {
  try { return JSON.parse(json); } catch { return {}; }
}

export async function listTools(group?: string) {
  const query = group
    ? db.select().from(tools).where(eq(tools.groupName, group)).orderBy(tools.createdAt)
    : db.select().from(tools).orderBy(tools.createdAt);
  const rows = await query;
  return rows.map(omitEnvVars);
}

export async function getTool(id: string) {
  const [row] = await db.select().from(tools).where(eq(tools.id, id));
  if (!row) throw new AppError('NOT_FOUND', `工具 ${id} 不存在`);
  return withEnvKeys(row);
}

export async function getToolRaw(id: string) {
  const [row] = await db.select().from(tools).where(eq(tools.id, id));
  if (!row) throw new AppError('NOT_FOUND', `工具 ${id} 不存在`);
  return row;
}

interface CreateToolInput {
  name: string;
  description: string;
  transportType?: string;
  command: string;
  args?: string[];
  envVars?: Record<string, string>;
  groupName?: string;
  accessLevel?: string;
}

export async function createTool(input: CreateToolInput) {
  const id = generateId();
  const timestamp = now();
  const [row] = await db.insert(tools).values({
    id,
    name: input.name,
    description: input.description,
    transportType: input.transportType ?? 'stdio',
    command: input.command,
    args: input.args ? JSON.stringify(input.args) : null,
    envVars: input.envVars ? JSON.stringify(input.envVars) : null,
    groupName: input.groupName ?? null,
    accessLevel: input.accessLevel ?? 'read',
    status: 'untested',
    createdAt: timestamp,
    updatedAt: timestamp,
  }).returning();
  return omitEnvVars(row);
}

interface UpdateToolInput {
  name?: string;
  description?: string;
  transportType?: string;
  command?: string;
  args?: string[];
  envVars?: Record<string, string>;
  groupName?: string;
  accessLevel?: string;
}

export async function updateTool(id: string, input: UpdateToolInput) {
  const raw = await getToolRaw(id);
  const updates: Record<string, unknown> = { updatedAt: now() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.transportType !== undefined) updates.transportType = input.transportType;
  if (input.command !== undefined) updates.command = input.command;
  if (input.args !== undefined) updates.args = JSON.stringify(input.args);
  // envVars: merge with existing
  // empty string = unchanged (skip), '__DELETE__' = remove key, other = update value
  if (input.envVars !== undefined) {
    const existing = raw.envVars ? safeParseObj(raw.envVars) : {};
    for (const [k, v] of Object.entries(input.envVars)) {
      if (v === '__DELETE__') delete existing[k];
      else if (v !== '') existing[k] = v;
      // v === '' means unchanged, skip
    }
    updates.envVars = JSON.stringify(existing);
  }
  if (input.groupName !== undefined) updates.groupName = input.groupName;
  if (input.accessLevel !== undefined) updates.accessLevel = input.accessLevel;

  await db.update(tools).set(updates).where(eq(tools.id, id));
  return getTool(id);
}

export async function deleteTool(id: string) {
  await getTool(id);

  // Check employee references (batch query)
  const empRefs = await db.select({ employeeId: employeeTools.employeeId })
    .from(employeeTools)
    .where(eq(employeeTools.toolId, id));

  // Check team references (batch query)
  const teamRefs = await db.select({ teamId: teamTools.teamId })
    .from(teamTools)
    .where(eq(teamTools.toolId, id));

  const references: Array<{ type: string; id: string; name: string }> = [];

  if (empRefs.length > 0) {
    const empIds = empRefs.map(r => r.employeeId);
    const emps = await db.select({ id: employees.id, name: employees.name })
      .from(employees).where(inArray(employees.id, empIds));
    for (const emp of emps) {
      references.push({ type: 'employee', id: emp.id, name: emp.name });
    }
  }

  if (teamRefs.length > 0) {
    const tIds = teamRefs.map(r => r.teamId);
    const teamRows = await db.select({ id: teams.id, name: teams.name })
      .from(teams).where(inArray(teams.id, tIds));
    for (const team of teamRows) {
      references.push({ type: 'team', id: team.id, name: team.name });
    }
  }

  if (references.length > 0) {
    throw new AppError('CONFLICT', `该工具被 ${references.length} 个资源引用，无法删除`, { references });
  }

  await db.delete(tools).where(eq(tools.id, id));
  return { id };
}

export async function updateToolStatus(id: string, status: string) {
  await db.update(tools).set({ status, updatedAt: now() }).where(eq(tools.id, id));
}

export async function toggleToolEnabled(id: string, enabled: boolean) {
  await getTool(id); // ensure exists
  await db.update(tools).set({ enabled: enabled ? 1 : 0, updatedAt: now() }).where(eq(tools.id, id));
  return getTool(id);
}

export async function listGroups() {
  const rows = await db.selectDistinct({ groupName: tools.groupName }).from(tools);
  return rows.map(r => r.groupName).filter(Boolean) as string[];
}
