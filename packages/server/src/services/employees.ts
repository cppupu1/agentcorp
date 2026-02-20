import { db, employees, employeeTools, models, tools, teamMembers, teams, generateId, now } from '@agentcorp/db';
import { eq, sql, inArray } from 'drizzle-orm';
import { AppError } from '../errors.js';

// Single-query list with model name and tool count (fixes N+1)
export async function listEmployees(tag?: string, search?: string) {
  const toolCountSq = db
    .select({ employeeId: employeeTools.employeeId, count: sql<number>`count(*)`.as('count') })
    .from(employeeTools)
    .groupBy(employeeTools.employeeId)
    .as('tc');

  let rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      avatar: employees.avatar,
      description: employees.description,
      modelId: employees.modelId,
      modelName: models.name,
      systemPrompt: employees.systemPrompt,
      tags: employees.tags,
      toolCount: sql<number>`coalesce(${toolCountSq.count}, 0)`,
      createdAt: employees.createdAt,
      updatedAt: employees.updatedAt,
    })
    .from(employees)
    .leftJoin(models, eq(employees.modelId, models.id))
    .leftJoin(toolCountSq, eq(employees.id, toolCountSq.employeeId))
    .orderBy(employees.createdAt);

  // Filter in JS for tag (JSON array in SQLite)
  if (tag) {
    rows = rows.filter(r => {
      try { const tags = r.tags ? JSON.parse(r.tags) : []; return tags.includes(tag); }
      catch { return false; }
    });
  }
  if (search) {
    const s = search.toLowerCase();
    rows = rows.filter(r => r.name.toLowerCase().includes(s));
  }

  return rows.map(r => ({
    ...r,
    modelName: r.modelName ?? '',
    tags: r.tags ? (() => { try { return JSON.parse(r.tags!); } catch { return []; } })() : [],
    toolCount: Number(r.toolCount),
  }));
}

// Detail with tools list
export async function getEmployee(id: string) {
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      avatar: employees.avatar,
      description: employees.description,
      modelId: employees.modelId,
      modelName: models.name,
      systemPrompt: employees.systemPrompt,
      tags: employees.tags,
      createdAt: employees.createdAt,
      updatedAt: employees.updatedAt,
    })
    .from(employees)
    .leftJoin(models, eq(employees.modelId, models.id))
    .where(eq(employees.id, id));

  if (rows.length === 0) throw new AppError('NOT_FOUND', `员工 ${id} 不存在`);
  const emp = rows[0];

  const empTools = await db.select({ id: tools.id, name: tools.name })
    .from(employeeTools)
    .innerJoin(tools, eq(employeeTools.toolId, tools.id))
    .where(eq(employeeTools.employeeId, id));

  return {
    ...emp,
    modelName: emp.modelName ?? '',
    tags: emp.tags ? JSON.parse(emp.tags) : [],
    toolCount: empTools.length,
    tools: empTools,
  };
}

interface CreateEmployeeInput {
  name: string;
  avatar?: string;
  description?: string;
  modelId: string;
  systemPrompt: string;
  tags?: string[];
  toolIds?: string[];
}

export async function createEmployee(input: CreateEmployeeInput) {
  // Validate modelId exists
  const [model] = await db.select({ id: models.id, name: models.name }).from(models).where(eq(models.id, input.modelId));
  if (!model) throw new AppError('NOT_FOUND', `模型 ${input.modelId} 不存在`);

  // Validate toolIds exist
  if (input.toolIds?.length) {
    const found = await db.select({ id: tools.id }).from(tools).where(inArray(tools.id, input.toolIds));
    const foundIds = new Set(found.map(t => t.id));
    for (const toolId of input.toolIds) {
      if (!foundIds.has(toolId)) throw new AppError('NOT_FOUND', `工具 ${toolId} 不存在`);
    }
  }

  // Auto-tag: append model name
  const tags = [...(input.tags ?? [])];
  if (!tags.includes(model.name)) tags.push(model.name);

  const id = generateId();
  const timestamp = now();
  await db.insert(employees).values({
    id,
    name: input.name,
    avatar: input.avatar ?? null,
    description: input.description ?? null,
    modelId: input.modelId,
    systemPrompt: input.systemPrompt,
    tags: JSON.stringify(tags),
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  // Insert employee_tools (batch)
  if (input.toolIds?.length) {
    await db.insert(employeeTools).values(
      input.toolIds.map(toolId => ({ employeeId: id, toolId }))
    );
  }

  return getEmployee(id);
}

interface UpdateEmployeeInput {
  name?: string;
  avatar?: string;
  description?: string;
  modelId?: string;
  systemPrompt?: string;
  tags?: string[];
  toolIds?: string[];
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput) {
  const [existing] = await db.select().from(employees).where(eq(employees.id, id));
  if (!existing) throw new AppError('NOT_FOUND', `员工 ${id} 不存在`);

  // Validate modelId if provided
  let newModelName: string | null = null;
  if (input.modelId) {
    const [model] = await db.select({ id: models.id, name: models.name }).from(models).where(eq(models.id, input.modelId));
    if (!model) throw new AppError('NOT_FOUND', `模型 ${input.modelId} 不存在`);
    newModelName = model.name;
  }

  // Validate toolIds if provided
  if (input.toolIds) {
    if (input.toolIds.length > 0) {
      const found = await db.select({ id: tools.id }).from(tools).where(inArray(tools.id, input.toolIds));
      const foundIds = new Set(found.map(t => t.id));
      for (const toolId of input.toolIds) {
        if (!foundIds.has(toolId)) throw new AppError('NOT_FOUND', `工具 ${toolId} 不存在`);
      }
    }
  }

  const updates: Record<string, unknown> = { updatedAt: now() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.avatar !== undefined) updates.avatar = input.avatar;
  if (input.description !== undefined) updates.description = input.description;
  if (input.modelId !== undefined) updates.modelId = input.modelId;
  if (input.systemPrompt !== undefined) updates.systemPrompt = input.systemPrompt;

  // Auto-tag: when modelId changes, update tags (remove old model tag, add new)
  if (input.tags !== undefined || newModelName) {
    let tags = input.tags ?? (existing.tags ? JSON.parse(existing.tags) : []);
    if (newModelName) {
      // Remove old model name tag
      if (existing.modelId) {
        const [oldModel] = await db.select({ name: models.name }).from(models).where(eq(models.id, existing.modelId));
        if (oldModel) tags = tags.filter((t: string) => t !== oldModel.name);
      }
      if (!tags.includes(newModelName)) tags.push(newModelName);
    }
    updates.tags = JSON.stringify(tags);
  }

  await db.update(employees).set(updates).where(eq(employees.id, id));

  // Replace toolIds if provided (including empty array to remove all)
  if (input.toolIds !== undefined) {
    await db.delete(employeeTools).where(eq(employeeTools.employeeId, id));
    if (input.toolIds.length > 0) {
      await db.insert(employeeTools).values(
        input.toolIds.map(toolId => ({ employeeId: id, toolId }))
      );
    }
  }

  return getEmployee(id);
}

export async function deleteEmployee(id: string) {
  const [existing] = await db.select().from(employees).where(eq(employees.id, id));
  if (!existing) throw new AppError('NOT_FOUND', `员工 ${id} 不存在`);

  // Check team references (as member or PM) — batch queries
  const pmRefs = await db.select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.pmEmployeeId, id));

  const memberRefs = await db.select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.employeeId, id));

  const references: Array<{ type: string; id: string; name: string }> = [];
  for (const ref of pmRefs) {
    references.push({ type: 'team', id: ref.id, name: ref.name });
  }

  if (memberRefs.length > 0) {
    const teamIds = memberRefs.map(r => r.teamId).filter(tid => !references.find(r => r.id === tid));
    if (teamIds.length > 0) {
      const teamRows = await db.select({ id: teams.id, name: teams.name })
        .from(teams).where(inArray(teams.id, teamIds));
      for (const team of teamRows) {
        references.push({ type: 'team', id: team.id, name: team.name });
      }
    }
  }

  if (references.length > 0) {
    throw new AppError('CONFLICT', `该员工被 ${references.length} 个团队引用，无法删除`, { references });
  }

  await db.delete(employeeTools).where(eq(employeeTools.employeeId, id));
  await db.delete(employees).where(eq(employees.id, id));
  return { id };
}

export async function copyEmployee(id: string) {
  const [original] = await db.select().from(employees).where(eq(employees.id, id));
  if (!original) throw new AppError('NOT_FOUND', `员工 ${id} 不存在`);

  const newId = generateId();
  const timestamp = now();
  await db.insert(employees).values({
    id: newId,
    name: `${original.name}(副本)`,
    avatar: original.avatar,
    description: original.description,
    modelId: original.modelId,
    systemPrompt: original.systemPrompt,
    tags: original.tags,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  // Copy tools
  const toolRows = await db.select({ toolId: employeeTools.toolId })
    .from(employeeTools)
    .where(eq(employeeTools.employeeId, id));

  for (const t of toolRows) {
    await db.insert(employeeTools).values({ employeeId: newId, toolId: t.toolId });
  }

  return getEmployee(newId);
}

export async function listTags() {
  const rows = await db.select({ tags: employees.tags }).from(employees);
  const tagSet = new Set<string>();
  for (const row of rows) {
    if (row.tags) {
      try { const parsed = JSON.parse(row.tags); for (const t of parsed) tagSet.add(t); }
      catch { /* skip malformed */ }
    }
  }
  return Array.from(tagSet);
}

// ---- Export ----

export async function exportEmployees(ids: string[]) {
  if (ids.length === 0) return [];

  const results = [];
  for (const id of ids) {
    const [emp] = await db.select().from(employees).where(eq(employees.id, id));
    if (!emp) continue;

    const empToolRows = await db
      .select({ name: tools.name })
      .from(employeeTools)
      .innerJoin(tools, eq(employeeTools.toolId, tools.id))
      .where(eq(employeeTools.employeeId, id));

    results.push({
      name: emp.name,
      avatar: emp.avatar,
      description: emp.description,
      systemPrompt: emp.systemPrompt,
      tags: emp.tags ? JSON.parse(emp.tags) : [],
      toolNames: empToolRows.map(t => t.name),
    });
  }
  return results;
}

// ---- Import ----

interface ImportEmployeeData {
  name: string;
  avatar?: string;
  description?: string;
  systemPrompt: string;
  tags?: string[];
  toolNames?: string[];
}

export async function importEmployees(data: ImportEmployeeData[], modelId: string) {
  // Validate model
  const [model] = await db.select({ id: models.id, name: models.name }).from(models).where(eq(models.id, modelId));
  if (!model) throw new AppError('NOT_FOUND', `模型 ${modelId} 不存在`);

  // Build tool name → id map
  const allTools = await db.select({ id: tools.id, name: tools.name }).from(tools);
  const toolNameMap = new Map(allTools.map(t => [t.name, t.id]));

  const created: string[] = [];
  const warnings: string[] = [];

  for (const item of data) {
    const toolIds: string[] = [];
    if (item.toolNames) {
      for (const tn of item.toolNames) {
        const tid = toolNameMap.get(tn);
        if (tid) {
          toolIds.push(tid);
        } else {
          warnings.push(`员工「${item.name}」的工具「${tn}」未找到，已跳过`);
        }
      }
    }

    const emp = await createEmployee({
      name: item.name,
      avatar: item.avatar,
      description: item.description,
      modelId,
      systemPrompt: item.systemPrompt,
      tags: item.tags,
      toolIds,
    });
    created.push(emp.id);
  }

  return { created, warnings };
}
