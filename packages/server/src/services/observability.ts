import { db, decisionLogs, toolCallLogs, tasks, subtasks, generateId, now } from '@agentcorp/db';
import { eq, and, gte, sql, desc } from 'drizzle-orm';

export async function logDecision(params: {
  taskId: string;
  subtaskId?: string;
  employeeId?: string;
  actor: 'pm' | 'employee' | 'system';
  action: string;
  input?: unknown;
  output?: unknown;
  reasoning?: string;
}) {
  await db.insert(decisionLogs).values({
    id: generateId(),
    taskId: params.taskId,
    subtaskId: params.subtaskId ?? null,
    employeeId: params.employeeId ?? null,
    actor: params.actor,
    action: params.action,
    input: params.input ? JSON.stringify(params.input) : null,
    output: params.output ? JSON.stringify(params.output) : null,
    reasoning: params.reasoning ?? null,
    createdAt: now(),
  });
}

export async function logToolCall(params: {
  taskId: string;
  subtaskId?: string;
  employeeId?: string;
  toolName: string;
  input?: unknown;
  output?: unknown;
  isError?: boolean;
  durationMs?: number;
}) {
  await db.insert(toolCallLogs).values({
    id: generateId(),
    taskId: params.taskId,
    subtaskId: params.subtaskId ?? null,
    employeeId: params.employeeId ?? null,
    toolName: params.toolName,
    input: params.input ? JSON.stringify(params.input) : null,
    output: params.output ? JSON.stringify(params.output) : null,
    isError: params.isError ? 1 : 0,
    durationMs: params.durationMs ?? null,
    createdAt: now(),
  });
}

function safeJsonParse(raw: string | null) {
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch { return raw; }
}

export async function getTaskTimeline(taskId: string) {
  const decisions = await db.select().from(decisionLogs).where(eq(decisionLogs.taskId, taskId)).limit(500);
  const toolCalls = await db.select().from(toolCallLogs).where(eq(toolCallLogs.taskId, taskId)).limit(500);

  const events = [
    ...decisions.map(d => ({
      id: d.id,
      type: 'decision' as const,
      taskId: d.taskId,
      subtaskId: d.subtaskId,
      employeeId: d.employeeId,
      actor: d.actor,
      action: d.action,
      input: safeJsonParse(d.input),
      output: safeJsonParse(d.output),
      reasoning: d.reasoning,
      createdAt: d.createdAt,
    })),
    ...toolCalls.map(t => ({
      id: t.id,
      type: 'tool_call' as const,
      taskId: t.taskId,
      subtaskId: t.subtaskId,
      employeeId: t.employeeId,
      toolName: t.toolName,
      input: safeJsonParse(t.input),
      output: safeJsonParse(t.output),
      isError: t.isError === 1,
      durationMs: t.durationMs,
      createdAt: t.createdAt,
    })),
  ];

  events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return events;
}

export async function getTaskDecisionLog(taskId: string) {
  const rows = await db.select().from(decisionLogs)
    .where(eq(decisionLogs.taskId, taskId))
    .orderBy(decisionLogs.createdAt);
  return rows.map(d => ({
    id: d.id,
    type: 'decision' as const,
    taskId: d.taskId,
    subtaskId: d.subtaskId,
    employeeId: d.employeeId,
    actor: d.actor,
    action: d.action,
    input: safeJsonParse(d.input),
    output: safeJsonParse(d.output),
    reasoning: d.reasoning,
    createdAt: d.createdAt,
  }));
}

export async function getTaskToolTrace(taskId: string) {
  const rows = await db.select().from(toolCallLogs)
    .where(eq(toolCallLogs.taskId, taskId))
    .orderBy(toolCallLogs.createdAt);
  return rows.map(t => ({
    id: t.id,
    type: 'tool_call' as const,
    taskId: t.taskId,
    subtaskId: t.subtaskId,
    employeeId: t.employeeId,
    toolName: t.toolName,
    input: safeJsonParse(t.input),
    output: safeJsonParse(t.output),
    isError: t.isError === 1,
    durationMs: t.durationMs,
    createdAt: t.createdAt,
  }));
}

export async function getHealthStats() {
  const now24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [activeResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(eq(tasks.status, 'executing'));

  const [failedResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(and(eq(tasks.status, 'failed'), gte(tasks.updatedAt, now24h)));

  const [completedResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tasks)
    .where(and(eq(tasks.status, 'completed'), gte(tasks.updatedAt, now24h)));

  const [tokenResult] = await db
    .select({ total: sql<number>`coalesce(sum(${tasks.tokenUsage}), 0)` })
    .from(tasks);

  return {
    activeTasks: activeResult?.count ?? 0,
    failedTasksLast24h: failedResult?.count ?? 0,
    completedTasksLast24h: completedResult?.count ?? 0,
    totalTokenUsage: tokenResult?.total ?? 0,
  };
}
