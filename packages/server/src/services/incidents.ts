import { db, incidentReports, tasks, decisionLogs, toolCallLogs, errorTraces, observerFindings, employees, models, generateId, now } from '@agentcorp/db';
import { eq, desc, and } from 'drizzle-orm';
import { createModel } from '@agentcorp/agent-core';
import { AppError } from '../errors.js';

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw); }
  catch { return fallback; }
}

/** Build timeline from decision_logs, tool_call_logs, error_traces, observer_findings */
async function buildTimeline(taskId: string) {
  const decisions = await db.select({
    id: decisionLogs.id,
    actor: decisionLogs.actor,
    action: decisionLogs.action,
    output: decisionLogs.output,
    createdAt: decisionLogs.createdAt,
  }).from(decisionLogs).where(eq(decisionLogs.taskId, taskId)).limit(200);

  const toolCalls = await db.select({
    id: toolCallLogs.id,
    toolName: toolCallLogs.toolName,
    isError: toolCallLogs.isError,
    durationMs: toolCallLogs.durationMs,
    createdAt: toolCallLogs.createdAt,
  }).from(toolCallLogs).where(eq(toolCallLogs.taskId, taskId)).limit(200);

  const errors = await db.select({
    id: errorTraces.id,
    errorType: errorTraces.errorType,
    errorMessage: errorTraces.errorMessage,
    resolution: errorTraces.resolution,
    createdAt: errorTraces.createdAt,
  }).from(errorTraces).where(eq(errorTraces.taskId, taskId));

  const findings = await db.select({
    id: observerFindings.id,
    severity: observerFindings.severity,
    category: observerFindings.category,
    description: observerFindings.description,
    createdAt: observerFindings.createdAt,
  }).from(observerFindings).where(eq(observerFindings.taskId, taskId));

  const events: Array<{ time: string; type: string; summary: string }> = [];

  for (const d of decisions) {
    events.push({ time: d.createdAt, type: 'decision', summary: `[${d.actor}] ${d.action}` });
  }
  for (const t of toolCalls) {
    events.push({ time: t.createdAt, type: 'tool_call', summary: `${t.toolName}${t.isError ? ' (错误)' : ''} ${t.durationMs ? `${t.durationMs}ms` : ''}` });
  }
  for (const e of errors) {
    events.push({ time: e.createdAt, type: 'error', summary: `[${e.errorType}] ${e.errorMessage}` });
  }
  for (const f of findings) {
    events.push({ time: f.createdAt, type: 'finding', summary: `[${f.severity}/${f.category}] ${f.description}` });
  }

  events.sort((a, b) => a.time.localeCompare(b.time));
  return events;
}

export async function createIncidentReport(taskId: string, triggerType: string) {
  // Validate task exists
  const [task] = await db.select({ id: tasks.id, title: tasks.title }).from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new AppError('NOT_FOUND', `任务 ${taskId} 不存在`);

  const validTypes = ['emergency_stop', 'circuit_breaker', 'observer_critical', 'manual'];
  if (!validTypes.includes(triggerType)) {
    throw new AppError('VALIDATION_ERROR', `triggerType 必须是 ${validTypes.join('|')}`);
  }

  const timeline = await buildTimeline(taskId);
  const id = generateId();
  const timestamp = now();

  await db.insert(incidentReports).values({
    id,
    taskId,
    triggerType,
    status: 'draft',
    timeline: JSON.stringify(timeline),
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  return getIncidentReport(id);
}

export async function getIncidentReport(id: string) {
  const [report] = await db.select({
    id: incidentReports.id,
    taskId: incidentReports.taskId,
    taskTitle: tasks.title,
    triggerType: incidentReports.triggerType,
    status: incidentReports.status,
    timeline: incidentReports.timeline,
    rootCause: incidentReports.rootCause,
    impact: incidentReports.impact,
    resolution: incidentReports.resolution,
    preventionPlan: incidentReports.preventionPlan,
    aiAnalysis: incidentReports.aiAnalysis,
    createdAt: incidentReports.createdAt,
    updatedAt: incidentReports.updatedAt,
  })
  .from(incidentReports)
  .leftJoin(tasks, eq(incidentReports.taskId, tasks.id))
  .where(eq(incidentReports.id, id));

  if (!report) throw new AppError('NOT_FOUND', `事故报告 ${id} 不存在`);

  return {
    ...report,
    timeline: safeJsonParse(report.timeline, []),
  };
}

export async function listIncidentReports(limit = 100) {
  const rows = await db.select({
    id: incidentReports.id,
    taskId: incidentReports.taskId,
    taskTitle: tasks.title,
    triggerType: incidentReports.triggerType,
    status: incidentReports.status,
    createdAt: incidentReports.createdAt,
    updatedAt: incidentReports.updatedAt,
  })
  .from(incidentReports)
  .leftJoin(tasks, eq(incidentReports.taskId, tasks.id))
  .orderBy(desc(incidentReports.createdAt))
  .limit(limit);

  return rows;
}

export async function updateIncidentReport(id: string, data: {
  rootCause?: string;
  impact?: string;
  resolution?: string;
  preventionPlan?: string;
}) {
  const [existing] = await db.select({ id: incidentReports.id }).from(incidentReports).where(eq(incidentReports.id, id));
  if (!existing) throw new AppError('NOT_FOUND', `事故报告 ${id} 不存在`);

  const updates: Record<string, unknown> = { updatedAt: now() };
  if (data.rootCause !== undefined) updates.rootCause = data.rootCause;
  if (data.impact !== undefined) updates.impact = data.impact;
  if (data.resolution !== undefined) updates.resolution = data.resolution;
  if (data.preventionPlan !== undefined) updates.preventionPlan = data.preventionPlan;

  await db.update(incidentReports).set(updates).where(eq(incidentReports.id, id));
  return getIncidentReport(id);
}

export async function analyzeIncident(id: string) {
  const report = await getIncidentReport(id);

  // Atomic status transition: only proceed if currently 'draft'
  const result = await db.update(incidentReports)
    .set({ status: 'analyzing', updatedAt: now() })
    .where(and(eq(incidentReports.id, id), eq(incidentReports.status, 'draft')));

  // Check if the update actually changed a row
  const [check] = await db.select({ status: incidentReports.status })
    .from(incidentReports).where(eq(incidentReports.id, id));
  if (check?.status !== 'analyzing') {
    // The atomic update didn't take effect — another process got there first
    if (check?.status === 'completed') {
      throw new AppError('CONFLICT', '该报告已完成分析，如需重新分析请先重置状态');
    }
    throw new AppError('CONFLICT', '该报告正在分析中，请稍后再试');
  }

  try {
    // Gather all data
    const timeline = report.timeline;
    const errors = await db.select().from(errorTraces).where(eq(errorTraces.taskId, report.taskId));
    const findings = await db.select({
      severity: observerFindings.severity,
      category: observerFindings.category,
      description: observerFindings.description,
    }).from(observerFindings).where(eq(observerFindings.taskId, report.taskId));

    // Find first available model (prefer PM models)
    const [model] = await db.select().from(models).limit(1);
    if (!model) {
      await db.update(incidentReports).set({ status: 'draft', updatedAt: now() }).where(eq(incidentReports.id, id));
      throw new AppError('INVALID_STATE', '没有可用的AI模型，无法进行分析');
    }

    const prompt = `你是一位资深的事故分析专家。请分析以下事故信息，给出详细的分析报告。

事故触发类型：${report.triggerType}
关联任务：${report.taskTitle || '未知'}

时间线事件：
${JSON.stringify(timeline, null, 2)}

错误记录：
${errors.map(e => `- [${e.errorType}] ${e.errorMessage} (解决: ${e.resolution || '未解决'})`).join('\n') || '无'}

观察者发现：
${findings.map(f => `- [${f.severity}/${f.category}] ${f.description}`).join('\n') || '无'}

请按以下格式输出分析：

## 根因分析
（分析事故的根本原因）

## 影响评估
（评估事故造成的影响范围和程度）

## 改进建议
（提出具体的预防措施和改进建议）`;

    const { generateText } = await import('ai');
    const aiModel = createModel({ apiKey: model.apiKey, baseURL: model.baseUrl, modelId: model.modelId });

    const result = await generateText({
      model: aiModel as any,
      prompt,
      abortSignal: AbortSignal.timeout(120000),
    });

    await db.update(incidentReports).set({
      aiAnalysis: result.text,
      status: 'completed',
      updatedAt: now(),
    }).where(eq(incidentReports.id, id));

    return getIncidentReport(id);
  } catch (err) {
    if (err instanceof AppError) throw err;
    // Revert status on failure
    await db.update(incidentReports).set({ status: 'draft', updatedAt: now() }).where(eq(incidentReports.id, id));
    throw err;
  }
}

export async function deleteIncidentReport(id: string) {
  const [existing] = await db.select({ id: incidentReports.id }).from(incidentReports).where(eq(incidentReports.id, id));
  if (!existing) throw new AppError('NOT_FOUND', `事故报告 ${id} 不存在`);

  await db.delete(incidentReports).where(eq(incidentReports.id, id));
  return { id };
}
