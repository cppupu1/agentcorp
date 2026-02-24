import { db, teams, teamMembers, teamTools, employees, models, tools, tasks, subtasks, taskMessages, tokenUsageLogs, decisionLogs, toolCallLogs, observerFindings, errorTraces, evidenceItems, notifications, generateId, now } from '@agentcorp/db';
import { eq, sql, inArray, desc } from 'drizzle-orm';
import { AppError } from '../errors.js';

const VALID_COLLAB_MODES = ['free', 'pipeline', 'debate', 'vote', 'master_slave'] as const;

// ---- List ----

export async function listTeams() {
  const memberCountSq = db
    .select({ teamId: teamMembers.teamId, count: sql<number>`count(*)`.as('member_count') })
    .from(teamMembers)
    .groupBy(teamMembers.teamId)
    .as('mc');

  const toolCountSq = db
    .select({ teamId: teamTools.teamId, count: sql<number>`count(*)`.as('tool_count') })
    .from(teamTools)
    .groupBy(teamTools.teamId)
    .as('tc');

  const taskCountSq = db
    .select({ teamId: tasks.teamId, count: sql<number>`count(*)`.as('task_count') })
    .from(tasks)
    .groupBy(tasks.teamId)
    .as('tsk');

  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      description: teams.description,
      scenario: teams.scenario,
      pmEmployeeId: teams.pmEmployeeId,
      pmName: employees.name,
      pmAvatar: employees.avatar,
      collaborationMode: teams.collaborationMode,
      memberCount: sql<number>`coalesce(${memberCountSq.count}, 0)`,
      toolCount: sql<number>`coalesce(${toolCountSq.count}, 0)`,
      taskCount: sql<number>`coalesce(${taskCountSq.count}, 0)`,
      createdAt: teams.createdAt,
      updatedAt: teams.updatedAt,
    })
    .from(teams)
    .leftJoin(employees, eq(teams.pmEmployeeId, employees.id))
    .leftJoin(memberCountSq, eq(teams.id, memberCountSq.teamId))
    .leftJoin(toolCountSq, eq(teams.id, toolCountSq.teamId))
    .leftJoin(taskCountSq, eq(teams.id, taskCountSq.teamId))
    .orderBy(desc(teams.createdAt));

  return rows.map(r => ({
    ...r,
    pmName: r.pmName ?? '',
    pmAvatar: r.pmAvatar ?? null,
    memberCount: Number(r.memberCount),
    toolCount: Number(r.toolCount),
    taskCount: Number(r.taskCount),
  }));
}

// ---- Detail ----

export async function getTeam(id: string) {
  const [team] = await db
    .select({
      id: teams.id,
      name: teams.name,
      description: teams.description,
      scenario: teams.scenario,
      pmEmployeeId: teams.pmEmployeeId,
      pmName: employees.name,
      pmAvatar: employees.avatar,
      collaborationMode: teams.collaborationMode,
      createdAt: teams.createdAt,
      updatedAt: teams.updatedAt,
    })
    .from(teams)
    .leftJoin(employees, eq(teams.pmEmployeeId, employees.id))
    .where(eq(teams.id, id));

  if (!team) throw new AppError('NOT_FOUND', `团队 ${id} 不存在`);

  const members = await db
    .select({ id: employees.id, name: employees.name, avatar: employees.avatar, role: teamMembers.role })
    .from(teamMembers)
    .innerJoin(employees, eq(teamMembers.employeeId, employees.id))
    .where(eq(teamMembers.teamId, id));

  const teamToolRows = await db
    .select({ id: tools.id, name: tools.name })
    .from(teamTools)
    .innerJoin(tools, eq(teamTools.toolId, tools.id))
    .where(eq(teamTools.teamId, id));

  return {
    ...team,
    pmName: team.pmName ?? '',
    pmAvatar: team.pmAvatar ?? null,
    members,
    tools: teamToolRows,
  };
}

// ---- Create ----

interface CreateTeamInput {
  name: string;
  description?: string;
  scenario?: string;
  pmEmployeeId: string;
  collaborationMode?: string;
  memberIds?: Array<{ employeeId: string; role?: string }>;
  toolIds?: string[];
}

export async function createTeam(input: CreateTeamInput) {
  // Validate PM exists
  const [pm] = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, input.pmEmployeeId));
  if (!pm) throw new AppError('NOT_FOUND', `PM员工 ${input.pmEmployeeId} 不存在`);

  // Deduplicate memberIds
  const uniqueMembers = deduplicateMembers(input.memberIds);

  // Validate member IDs
  if (uniqueMembers.length > 0) {
    const empIds = uniqueMembers.map(m => m.employeeId);
    const found = await db.select({ id: employees.id }).from(employees).where(inArray(employees.id, empIds));
    const foundSet = new Set(found.map(e => e.id));
    for (const eid of empIds) {
      if (!foundSet.has(eid)) throw new AppError('NOT_FOUND', `员工 ${eid} 不存在`);
    }
  }

  // Deduplicate toolIds
  const uniqueToolIds = [...new Set(input.toolIds ?? [])];

  // Validate tool IDs
  if (uniqueToolIds.length > 0) {
    const found = await db.select({ id: tools.id }).from(tools).where(inArray(tools.id, uniqueToolIds));
    const foundSet = new Set(found.map(t => t.id));
    for (const tid of uniqueToolIds) {
      if (!foundSet.has(tid)) throw new AppError('NOT_FOUND', `工具 ${tid} 不存在`);
    }
  }

  const id = generateId();
  const timestamp = now();

  db.transaction((tx) => {
    tx.insert(teams).values({
      id,
      name: input.name,
      description: input.description ?? null,
      scenario: input.scenario ?? null,
      pmEmployeeId: input.pmEmployeeId,
      collaborationMode: input.collaborationMode ?? 'free',
      createdAt: timestamp,
      updatedAt: timestamp,
    }).run();

    if (uniqueMembers.length > 0) {
      tx.insert(teamMembers).values(
        uniqueMembers.map(m => ({ teamId: id, employeeId: m.employeeId, role: m.role ?? 'member' }))
      ).run();
    }

    if (uniqueToolIds.length > 0) {
      tx.insert(teamTools).values(
        uniqueToolIds.map(tid => ({ teamId: id, toolId: tid }))
      ).run();
    }
  });

  return getTeam(id);
}

// ---- Update ----

interface UpdateTeamInput {
  name?: string;
  description?: string;
  scenario?: string;
  pmEmployeeId?: string;
  collaborationMode?: string;
  memberIds?: Array<{ employeeId: string; role?: string }>;
  toolIds?: string[];
}

export async function updateTeam(id: string, input: UpdateTeamInput) {
  const [existing] = await db.select().from(teams).where(eq(teams.id, id));
  if (!existing) throw new AppError('NOT_FOUND', `团队 ${id} 不存在`);

  // Validate PM if changed
  if (input.pmEmployeeId) {
    const [pm] = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, input.pmEmployeeId));
    if (!pm) throw new AppError('NOT_FOUND', `PM员工 ${input.pmEmployeeId} 不存在`);
  }

  // Deduplicate members
  const uniqueMembers = input.memberIds !== undefined ? deduplicateMembers(input.memberIds) : undefined;

  // Validate members if provided
  if (uniqueMembers && uniqueMembers.length > 0) {
    const empIds = uniqueMembers.map(m => m.employeeId);
    const found = await db.select({ id: employees.id }).from(employees).where(inArray(employees.id, empIds));
    const foundSet = new Set(found.map(e => e.id));
    for (const eid of empIds) {
      if (!foundSet.has(eid)) throw new AppError('NOT_FOUND', `员工 ${eid} 不存在`);
    }
  }

  // Deduplicate tools
  const uniqueToolIds = input.toolIds !== undefined ? [...new Set(input.toolIds)] : undefined;

  // Validate tools if provided
  if (uniqueToolIds && uniqueToolIds.length > 0) {
    const found = await db.select({ id: tools.id }).from(tools).where(inArray(tools.id, uniqueToolIds));
    const foundSet = new Set(found.map(t => t.id));
    for (const tid of uniqueToolIds) {
      if (!foundSet.has(tid)) throw new AppError('NOT_FOUND', `工具 ${tid} 不存在`);
    }
  }

  const updates: Record<string, unknown> = { updatedAt: now() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.scenario !== undefined) updates.scenario = input.scenario;
  if (input.pmEmployeeId !== undefined) updates.pmEmployeeId = input.pmEmployeeId;
  if (input.collaborationMode !== undefined) updates.collaborationMode = input.collaborationMode;

  db.transaction((tx) => {
    tx.update(teams).set(updates).where(eq(teams.id, id)).run();

    if (uniqueMembers !== undefined) {
      tx.delete(teamMembers).where(eq(teamMembers.teamId, id)).run();
      if (uniqueMembers.length > 0) {
        tx.insert(teamMembers).values(
          uniqueMembers.map(m => ({ teamId: id, employeeId: m.employeeId, role: m.role ?? 'member' }))
        ).run();
      }
    }

    if (uniqueToolIds !== undefined) {
      tx.delete(teamTools).where(eq(teamTools.teamId, id)).run();
      if (uniqueToolIds.length > 0) {
        tx.insert(teamTools).values(
          uniqueToolIds.map(tid => ({ teamId: id, toolId: tid }))
        ).run();
      }
    }
  });

  return getTeam(id);
}

// ---- Delete ----

export async function deleteTeam(id: string) {
  const [existing] = await db.select().from(teams).where(eq(teams.id, id));
  if (!existing) throw new AppError('NOT_FOUND', `团队 ${id} 不存在`);

  // Check for active tasks
  const activeTasks = await db
    .select({ id: tasks.id, title: tasks.title, status: tasks.status })
    .from(tasks)
    .where(eq(tasks.teamId, id));

  const activeRefs = activeTasks.filter(t => t.status !== 'completed' && t.status !== 'draft');
  if (activeRefs.length > 0) {
    throw new AppError('CONFLICT', `该团队有 ${activeRefs.length} 个进行中的任务，无法删除`, {
      references: activeRefs.map(t => ({ type: 'task', id: t.id, name: t.title || '未命名任务' })),
    });
  }

  // Delete tasks in draft/completed status (they reference this team)
  const removableTasks = activeTasks.filter(t => t.status === 'draft' || t.status === 'completed');
  if (removableTasks.length > 0) {
    const ids = removableTasks.map(t => t.id);
    // Delete child tables referencing subtasks first
    db.transaction((tx) => {
      tx.delete(tokenUsageLogs).where(inArray(tokenUsageLogs.taskId, ids)).run();
      tx.delete(decisionLogs).where(inArray(decisionLogs.taskId, ids)).run();
      tx.delete(toolCallLogs).where(inArray(toolCallLogs.taskId, ids)).run();
      tx.delete(observerFindings).where(inArray(observerFindings.taskId, ids)).run();
      tx.delete(errorTraces).where(inArray(errorTraces.taskId, ids)).run();
      tx.delete(evidenceItems).where(inArray(evidenceItems.taskId, ids)).run();
      tx.delete(notifications).where(inArray(notifications.taskId, ids)).run();
      tx.delete(subtasks).where(inArray(subtasks.taskId, ids)).run();
      tx.delete(taskMessages).where(inArray(taskMessages.taskId, ids)).run();
      tx.delete(tasks).where(inArray(tasks.id, ids)).run();
    });
  }

  // team_members and team_tools cascade automatically
  await db.delete(teams).where(eq(teams.id, id));
  return { id };
}

// ---- Copy ----

export async function copyTeam(id: string) {
  const original = await getTeam(id);

  // Validate PM still exists
  if (original.pmEmployeeId) {
    const [pm] = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, original.pmEmployeeId));
    if (!pm) throw new AppError('CONFLICT', 'PM员工已被删除，无法复制');
  }

  // Validate members still exist
  if (original.members.length > 0) {
    const empIds = original.members.map(m => m.id);
    const found = await db.select({ id: employees.id }).from(employees).where(inArray(employees.id, empIds));
    if (found.length !== empIds.length) {
      throw new AppError('CONFLICT', '部分成员已被删除，无法复制');
    }
  }

  const newId = generateId();
  const timestamp = now();

  db.transaction((tx) => {
    tx.insert(teams).values({
      id: newId,
      name: `${original.name}(副本)`,
      description: original.description,
      scenario: original.scenario,
      pmEmployeeId: original.pmEmployeeId,
      collaborationMode: original.collaborationMode,
      createdAt: timestamp,
      updatedAt: timestamp,
    }).run();

    if (original.members.length > 0) {
      tx.insert(teamMembers).values(
        original.members.map(m => ({ teamId: newId, employeeId: m.id, role: m.role ?? 'member' }))
      ).run();
    }

    if (original.tools.length > 0) {
      tx.insert(teamTools).values(
        original.tools.map(t => ({ teamId: newId, toolId: t.id }))
      ).run();
    }
  });

  return getTeam(newId);
}

// ---- Helpers ----

function deduplicateMembers(members?: Array<{ employeeId: string; role?: string }>) {
  if (!members) return [];
  const seen = new Set<string>();
  return members.filter(m => {
    if (seen.has(m.employeeId)) return false;
    seen.add(m.employeeId);
    return true;
  });
}

export { VALID_COLLAB_MODES };
