import { db, employees, employeeTools, models, tools, teamMembers, teams, subtasks, tasks, generateId, now } from '@agentcorp/db';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { createModel } from '@agentcorp/agent-core';
import { generateText } from 'ai';
import { getModelIdForFeature } from './system.js';
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

// ---- Status ----

export async function getEmployeeStatuses() {
  const allEmps = await db.select({ id: employees.id }).from(employees);

  // Batch: all running subtasks grouped by assignee
  const runningRows = await db
    .select({ assigneeId: subtasks.assigneeId })
    .from(subtasks)
    .where(eq(subtasks.status, 'running'))
    .groupBy(subtasks.assigneeId);
  const workingSet = new Set(runningRows.map(r => r.assigneeId));

  // Batch: all pending subtasks joined with executing tasks, grouped by assignee
  const waitingRows = await db
    .select({ assigneeId: subtasks.assigneeId })
    .from(subtasks)
    .innerJoin(tasks, eq(subtasks.taskId, tasks.id))
    .where(and(eq(subtasks.status, 'pending'), eq(tasks.status, 'executing')))
    .groupBy(subtasks.assigneeId);
  const waitingSet = new Set(waitingRows.map(r => r.assigneeId));

  return allEmps.map(emp => ({
    employeeId: emp.id,
    status: workingSet.has(emp.id) ? 'working' as const
      : waitingSet.has(emp.id) ? 'waiting' as const
      : 'idle' as const,
  }));
}

// ---- Auto Assign Tools (AI-powered) ----

/** Use AI to analyze employee profile and recommend suitable tools */
async function aiMatchToolsForEmployee(
  empName: string,
  empPrompt: string,
  empTags: string[],
  empDesc: string,
  availableTools: Array<{ name: string; description: string }>,
): Promise<string[]> {
  const modelId = getModelIdForFeature('tool_assign_model_id');
  if (!modelId) throw new AppError('VALIDATION_ERROR', '未配置工具装载模型，请在模型管理中设置默认模型');

  const [model] = await db.select().from(models).where(eq(models.id, modelId));
  if (!model) throw new AppError('NOT_FOUND', `模型 ${modelId} 不存在`);

  const aiModel = createModel({
    apiKey: model.apiKey,
    baseURL: model.baseUrl,
    modelId: model.modelId,
  });

  const toolList = availableTools.map(t => `- "${t.name}": ${t.description}`).join('\n');

  const result = await generateText({
    model: aiModel as any,
    system: 'You are a tool assignment assistant. Analyze the employee profile and select the most suitable tools. Return ONLY a JSON array of tool names, e.g. ["Tool A", "Tool B"]. No markdown, no explanation.',
    prompt: `Employee: ${empName}
Description: ${empDesc || 'N/A'}
Tags: ${empTags.join(', ') || 'N/A'}
System Prompt (excerpt): ${empPrompt.slice(0, 500)}

Available tools:
${toolList}

Which tools should this employee have access to? Consider their role, responsibilities, and what tools would help them work effectively.`,
  });

  try {
    const parsed = JSON.parse(result.text.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    if (Array.isArray(parsed)) return parsed.filter((n): n is string => typeof n === 'string');
  } catch { /* fall through */ }
  return [];
}

/** Auto-assign tools to a single employee via AI analysis */
export async function autoAssignToolsForEmployee(employeeId: string) {
  const [emp] = await db.select().from(employees).where(eq(employees.id, employeeId));
  if (!emp) throw new AppError('NOT_FOUND', `员工 ${employeeId} 不存在`);

  const allTools = await db.select({ id: tools.id, name: tools.name, description: tools.description }).from(tools);
  const toolNameToId = new Map(allTools.map(t => [t.name, t.id]));

  const empTags = emp.tags ? JSON.parse(emp.tags) : [];
  const matchedNames = await aiMatchToolsForEmployee(
    emp.name, emp.systemPrompt ?? '', empTags, emp.description ?? '',
    allTools.map(t => ({ name: t.name, description: t.description ?? '' })),
  );

  const toolIds: string[] = [];
  const assignedTools: string[] = [];
  for (const name of matchedNames) {
    const id = toolNameToId.get(name);
    if (id) { toolIds.push(id); assignedTools.push(name); }
  }

  // Replace existing tools
  await db.delete(employeeTools).where(eq(employeeTools.employeeId, employeeId));
  if (toolIds.length > 0) {
    await db.insert(employeeTools).values(toolIds.map(toolId => ({ employeeId, toolId })));
  }

  return { employeeId, assignedTools, count: toolIds.length };
}

/** Batch AI: match tools for ALL employees in a single LLM call */
async function aiBatchMatchTools(
  emps: Array<{ name: string; description: string; tags: string[]; systemPrompt: string }>,
  availableTools: Array<{ name: string; description: string }>,
): Promise<Record<string, string[]>> {
  const modelId = getModelIdForFeature('tool_assign_model_id');
  if (!modelId) throw new AppError('VALIDATION_ERROR', '未配置工具装载模型，请在模型管理中设置默认模型');

  const [model] = await db.select().from(models).where(eq(models.id, modelId));
  if (!model) throw new AppError('NOT_FOUND', `模型 ${modelId} 不存在`);

  const aiModel = createModel({
    apiKey: model.apiKey,
    baseURL: model.baseUrl,
    modelId: model.modelId,
  });

  const toolList = availableTools.map(t => `- "${t.name}": ${t.description}`).join('\n');
  const empList = emps.map(e =>
    `- "${e.name}": ${e.description || 'N/A'} (tags: ${e.tags.join(', ') || 'N/A'}, prompt excerpt: ${(e.systemPrompt || '').slice(0, 200)})`
  ).join('\n');

  const result = await generateText({
    model: aiModel as any,
    system: 'You are a tool assignment assistant. For each employee, select the most suitable tools based on their role. Return ONLY a JSON object mapping employee names to arrays of tool names. No markdown, no explanation.',
    prompt: `Employees:\n${empList}\n\nAvailable tools:\n${toolList}\n\nReturn a JSON object like: {"Employee A": ["Tool1", "Tool2"], "Employee B": ["Tool3"]}`,
  });

  try {
    const parsed = JSON.parse(result.text.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
    if (typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch { /* fall through */ }
  return {};
}

/** Auto-assign tools to ALL employees via AI analysis (single batched LLM call) */
export async function autoAssignToolsForAll() {
  const allEmps = await db.select({
    id: employees.id,
    name: employees.name,
    systemPrompt: employees.systemPrompt,
    tags: employees.tags,
    description: employees.description,
  }).from(employees);

  const allTools = await db.select({ id: tools.id, name: tools.name, description: tools.description }).from(tools);
  const toolNameToId = new Map(allTools.map(t => [t.name, t.id]));

  // Single LLM call for all employees
  const empInfos = allEmps.map(e => ({
    name: e.name,
    description: e.description ?? '',
    tags: e.tags ? JSON.parse(e.tags) : [],
    systemPrompt: e.systemPrompt ?? '',
  }));

  const mapping = await aiBatchMatchTools(
    empInfos,
    allTools.map(t => ({ name: t.name, description: t.description ?? '' })),
  );

  let totalAssigned = 0;
  const results: Array<{ employeeId: string; tools: string[]; count: number }> = [];

  for (const emp of allEmps) {
    const matchedNames: string[] = (mapping[emp.name] || []).filter(
      (n: unknown): n is string => typeof n === 'string',
    );

    const toolIds: string[] = [];
    const assignedTools: string[] = [];
    for (const name of matchedNames) {
      const id = toolNameToId.get(name);
      if (id) { toolIds.push(id); assignedTools.push(name); }
    }

    await db.delete(employeeTools).where(eq(employeeTools.employeeId, emp.id));
    if (toolIds.length > 0) {
      await db.insert(employeeTools).values(toolIds.map(toolId => ({ employeeId: emp.id, toolId })));
    }

    totalAssigned += toolIds.length;
    results.push({ employeeId: emp.id, tools: assignedTools, count: toolIds.length });
  }

  return { employeeCount: allEmps.length, totalAssigned, results };
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
