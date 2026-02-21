import { db, employeeMemories, teamMemories, tasks, subtasks, employees, generateId, now } from '@agentcorp/db';
import { eq, and, like, desc } from 'drizzle-orm';
import { AppError } from '../errors.js';

export async function extractMemoriesFromTask(taskId: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new AppError('NOT_FOUND', `任务 ${taskId} 不存在`);

  const subs = await db.select({
    id: subtasks.id,
    title: subtasks.title,
    status: subtasks.status,
    assigneeId: subtasks.assigneeId,
    output: subtasks.output,
  }).from(subtasks).where(eq(subtasks.taskId, taskId));

  const memories: Array<{ scope: 'employee' | 'team'; targetId: string; type: string; summary: string; detail: string; tags: string[] }> = [];

  // Extract per-employee memories from completed subtasks
  for (const sub of subs) {
    if (!sub.assigneeId || sub.status !== 'completed') continue;
    memories.push({
      scope: 'employee',
      targetId: sub.assigneeId,
      type: 'strategy',
      summary: `成功完成: ${sub.title}`,
      detail: `任务 "${task.title}" 中的子任务 "${sub.title}" 已成功完成。${sub.output ? '输出摘要: ' + String(sub.output).slice(0, 200) : ''}`,
      tags: ['task_completion'],
    });
  }

  // Extract failure memories
  const failedSubs = subs.filter(s => s.status === 'failed' && s.assigneeId);
  for (const sub of failedSubs) {
    memories.push({
      scope: 'employee',
      targetId: sub.assigneeId!,
      type: 'failure',
      summary: `失败经验: ${sub.title}`,
      detail: `任务 "${task.title}" 中的子任务 "${sub.title}" 执行失败，需要注意避免类似问题。`,
      tags: ['failure_lesson'],
    });
  }

  // Team-level memory if task has a team
  if (task.teamId) {
    const completedCount = subs.filter(s => s.status === 'completed').length;
    memories.push({
      scope: 'team',
      targetId: task.teamId,
      type: 'review_summary',
      summary: `任务复盘: ${task.title || '未命名任务'}`,
      detail: `任务状态: ${task.status}, 子任务完成: ${completedCount}/${subs.length}`,
      tags: ['task_review'],
    });
  }

  // Save all memories
  const created: string[] = [];
  const ts = now();
  for (const m of memories) {
    const id = generateId();
    if (m.scope === 'employee') {
      await db.insert(employeeMemories).values({
        id, employeeId: m.targetId, sourceTaskId: taskId,
        type: m.type, summary: m.summary, detail: m.detail,
        tags: JSON.stringify(m.tags), confidence: 70,
        createdAt: ts, updatedAt: ts,
      });
    } else {
      await db.insert(teamMemories).values({
        id, teamId: m.targetId, sourceTaskId: taskId,
        type: m.type, summary: m.summary, detail: m.detail,
        tags: JSON.stringify(m.tags),
        createdAt: ts, updatedAt: ts,
      });
    }
    created.push(id);
  }

  return { extracted: created.length, ids: created };
}

export async function getEmployeeMemories(employeeId: string, opts?: { type?: string; search?: string }) {
  const conditions = [eq(employeeMemories.employeeId, employeeId)];
  if (opts?.type) conditions.push(eq(employeeMemories.type, opts.type));
  if (opts?.search) conditions.push(like(employeeMemories.summary, `%${opts.search}%`));

  return db.select().from(employeeMemories)
    .where(and(...conditions))
    .orderBy(desc(employeeMemories.createdAt));
}

export async function getTeamMemories(teamId: string, opts?: { type?: string }) {
  const conditions = [eq(teamMemories.teamId, teamId)];
  if (opts?.type) conditions.push(eq(teamMemories.type, opts.type));

  return db.select().from(teamMemories)
    .where(and(...conditions))
    .orderBy(desc(teamMemories.createdAt));
}

export async function retrieveRelevantMemories(employeeId: string, taskDescription: string) {
  const keywords = taskDescription.split(/\s+/).filter(w => w.length > 1).slice(0, 5);
  if (keywords.length === 0) return [];

  // Fetch all memories for this employee, then filter by keywords client-side
  const rows = await db.select().from(employeeMemories)
    .where(eq(employeeMemories.employeeId, employeeId))
    .orderBy(desc(employeeMemories.confidence), desc(employeeMemories.usageCount));

  return rows.filter(r => {
    const text = r.summary + ' ' + r.detail;
    return keywords.some(k => text.includes(k));
  }).slice(0, 10);
}

export async function updateMemory(id: string, scope: 'employee' | 'team', data: { summary?: string; detail?: string; tags?: string[] }) {
  const table = scope === 'employee' ? employeeMemories : teamMemories;
  const [existing] = await db.select({ id: table.id }).from(table).where(eq(table.id, id));
  if (!existing) throw new AppError('NOT_FOUND', `记忆 ${id} 不存在`);

  const updates: any = { updatedAt: now() };
  if (data.summary) updates.summary = data.summary;
  if (data.detail) updates.detail = data.detail;
  if (data.tags) updates.tags = JSON.stringify(data.tags);

  await db.update(table).set(updates).where(eq(table.id, id));
  return { id };
}

export async function deleteMemory(id: string, scope: 'employee' | 'team') {
  const table = scope === 'employee' ? employeeMemories : teamMemories;
  const [existing] = await db.select({ id: table.id }).from(table).where(eq(table.id, id));
  if (!existing) throw new AppError('NOT_FOUND', `记忆 ${id} 不存在`);
  await db.delete(table).where(eq(table.id, id));
  return { id };
}
