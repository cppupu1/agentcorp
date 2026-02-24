import { db, tokenUsageLogs, tasks, subtasks, employees, models, testRuns, observerFindings, errorTraces, employeeCompetencyScores, teamMembers, generateId, now } from '@agentcorp/db';
import { eq, and, gte, lte, lt, sql, desc } from 'drizzle-orm';
import { createModel } from '@agentcorp/agent-core';
import { generateText } from 'ai';
import { getSetting } from './system.js';
import { AppError } from '../errors.js';

export async function getTaskCostReview(taskId: string) {
  const [task] = await db.select({
    id: tasks.id,
    title: tasks.title,
    status: tasks.status,
    estimatedCost: tasks.estimatedCost,
    actualCost: tasks.actualCost,
    budgetLimit: tasks.budgetLimit,
    createdAt: tasks.createdAt,
    updatedAt: tasks.updatedAt,
  }).from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new AppError('NOT_FOUND', `任务 ${taskId} 不存在`);

  const subs = await db.select({
    id: subtasks.id,
    title: subtasks.title,
    status: subtasks.status,
    assigneeId: subtasks.assigneeId,
    assigneeName: employees.name,
  }).from(subtasks)
    .leftJoin(employees, eq(subtasks.assigneeId, employees.id))
    .where(eq(subtasks.taskId, taskId));

  const totalSubs = subs.length;
  const completedSubs = subs.filter(s => s.status === 'completed').length;

  // Time analysis
  const startTime = new Date(task.createdAt).getTime();
  const endTime = task.status === 'completed' || task.status === 'failed'
    ? new Date(task.updatedAt).getTime() : Date.now();
  const durationMs = endTime - startTime;

  // Cost deviation
  const deviation = task.estimatedCost && task.actualCost
    ? Math.round(((task.actualCost - task.estimatedCost) / task.estimatedCost) * 100)
    : null;

  return {
    ...task,
    subtaskStats: { total: totalSubs, completed: completedSubs },
    durationMs,
    costDeviation: deviation,
  };
}

export async function getCostTrend(startDate?: string, endDate?: string, granularity: string = 'day') {
  const conditions = [];
  if (startDate) conditions.push(gte(tokenUsageLogs.createdAt, startDate));
  if (endDate) conditions.push(lte(tokenUsageLogs.createdAt, endDate));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const dateFn = granularity === 'month'
    ? sql<string>`substr(${tokenUsageLogs.createdAt}, 1, 7)`
    : sql<string>`substr(${tokenUsageLogs.createdAt}, 1, 10)`;

  const rows = await db
    .select({
      period: dateFn,
      totalCost: sql<number>`coalesce(sum(${tokenUsageLogs.estimatedCost}), 0)`,
      totalTokens: sql<number>`coalesce(sum(${tokenUsageLogs.inputTokens}) + sum(${tokenUsageLogs.outputTokens}), 0)`,
      taskCount: sql<number>`count(distinct ${tokenUsageLogs.taskId})`,
    })
    .from(tokenUsageLogs)
    .where(where)
    .groupBy(dateFn)
    .orderBy(dateFn);

  return rows;
}

let summaryCache: { summary: string | null; ts: number } | null = null;
const SUMMARY_CACHE_TTL = 10 * 60 * 1000; // 10 min

export async function generateRoiSummary() {
  if (summaryCache && Date.now() - summaryCache.ts < SUMMARY_CACHE_TTL) {
    return { summary: summaryCache.summary };
  }

  const modelId = getSetting('hr_assistant_model_id');
  if (!modelId) return { summary: null };

  const [model] = await db.select().from(models).where(eq(models.id, modelId));
  if (!model) return { summary: null };

  // Get recent cost trend data
  const trendData = await getCostTrend(undefined, undefined, 'day');
  if (trendData.length === 0) return { summary: null };

  // Get completed task count
  const [taskStats] = await db.select({
    total: sql<number>`count(*)`,
    completed: sql<number>`sum(case when ${tasks.status} = 'completed' then 1 else 0 end)`,
    failed: sql<number>`sum(case when ${tasks.status} = 'failed' then 1 else 0 end)`,
  }).from(tasks);

  const totalCost = trendData.reduce((s, r) => s + Number(r.totalCost), 0);
  const totalTokens = trendData.reduce((s, r) => s + Number(r.totalTokens), 0);
  const totalTasks = trendData.reduce((s, r) => s + Number(r.taskCount), 0);

  const aiModel = createModel({
    apiKey: model.apiKey,
    baseURL: model.baseUrl,
    modelId: model.modelId,
  });

  const prompt = `Based on the following AI team usage data, write a brief 2-3 sentence summary in the user's language (Chinese if data has Chinese context, otherwise English). Be specific with numbers. Focus on value delivered.

Data:
- Total cost: $${(totalCost / 100).toFixed(2)}
- Total tokens used: ${totalTokens.toLocaleString()}
- Tasks processed: ${totalTasks}
- Tasks completed: ${taskStats?.completed ?? 0}
- Tasks failed: ${taskStats?.failed ?? 0}
- Date range: ${trendData[0].period} to ${trendData[trendData.length - 1].period}
- Daily breakdown: ${JSON.stringify(trendData.slice(-7))}`;

  try {
    const result = await generateText({
      model: aiModel as any,
      system: 'You are a concise business analyst. Write a brief, data-driven summary. No markdown, no bullet points, just plain text.',
      prompt,
    });
    const text = result.text.trim();
    summaryCache = { summary: text, ts: Date.now() };
    return { summary: text };
  } catch {
    return { summary: null };
  }
}

export async function computeEmployeeCompetency(employeeId: string, period?: string) {
  const p = period || new Date().toISOString().slice(0, 7);
  const startDate = `${p}-01T00:00:00.000Z`;
  const endMonth = parseInt(p.slice(5, 7));
  const endYear = parseInt(p.slice(0, 4));
  const nextMonth = endMonth === 12 ? 1 : endMonth + 1;
  const nextYear = endMonth === 12 ? endYear + 1 : endYear;
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00.000Z`;

  // Completion rate: completed subtasks / total assigned subtasks
  const assigned = await db.select({ id: subtasks.id, status: subtasks.status })
    .from(subtasks)
    .where(and(eq(subtasks.assigneeId, employeeId), gte(subtasks.createdAt, startDate), lt(subtasks.createdAt, endDate)));

  const taskCount = assigned.length;
  const completed = assigned.filter(s => s.status === 'completed').length;
  const completionRate = taskCount > 0 ? Math.round((completed / taskCount) * 100) : 0;

  // Quality: test pass rate
  const runs = await db.select({
    passed: testRuns.passedScenarios,
    total: testRuns.totalScenarios,
  }).from(testRuns)
    .where(and(eq(testRuns.employeeId, employeeId), gte(testRuns.createdAt, startDate), lt(testRuns.createdAt, endDate)));

  const totalScenarios = runs.reduce((s, r) => s + (r.total ?? 0), 0);
  const passedScenarios = runs.reduce((s, r) => s + (r.passed ?? 0), 0);
  const qualityScore = totalScenarios > 0 ? Math.round((passedScenarios / totalScenarios) * 100) : (taskCount > 0 ? 70 : 0);

  // Stability: error rate
  const errors = await db.select({ id: errorTraces.id })
    .from(errorTraces)
    .innerJoin(subtasks, eq(errorTraces.subtaskId, subtasks.id))
    .where(and(eq(subtasks.assigneeId, employeeId), gte(errorTraces.createdAt, startDate), lt(errorTraces.createdAt, endDate)));

  const errorCount = errors.length;
  const stabilityScore = taskCount > 0 ? Math.max(0, 100 - Math.round((errorCount / taskCount) * 50)) : 0;

  // Efficiency: avg tokens per subtask (lower is better, normalize to 0-100)
  const [tokenStats] = await db.select({
    avgTokens: sql<number>`coalesce(avg(${tokenUsageLogs.inputTokens} + ${tokenUsageLogs.outputTokens}), 0)`,
  }).from(tokenUsageLogs)
    .where(and(eq(tokenUsageLogs.employeeId, employeeId), gte(tokenUsageLogs.createdAt, startDate), lt(tokenUsageLogs.createdAt, endDate)));

  const avgTokens = tokenStats?.avgTokens ?? 0;
  // Normalize: <5000 tokens = 100, >50000 = 0
  const efficiencyScore = taskCount > 0 ? Math.max(0, Math.min(100, Math.round(100 - (avgTokens - 5000) / 450))) : 0;

  const overallScore = taskCount > 0
    ? Math.round(completionRate * 0.3 + qualityScore * 0.3 + stabilityScore * 0.2 + efficiencyScore * 0.2)
    : 0;

  // Upsert
  const [existing] = await db.select({ id: employeeCompetencyScores.id })
    .from(employeeCompetencyScores)
    .where(and(eq(employeeCompetencyScores.employeeId, employeeId), eq(employeeCompetencyScores.period, p)));

  const record = {
    employeeId, period: p, completionRate, qualityScore, efficiencyScore,
    stabilityScore, overallScore, taskCount,
    details: JSON.stringify({ totalScenarios, passedScenarios, errorCount, avgTokens }),
  };

  if (existing) {
    await db.update(employeeCompetencyScores).set(record).where(eq(employeeCompetencyScores.id, existing.id));
    return { id: existing.id, ...record };
  }

  const id = generateId();
  const ts = now();
  await db.insert(employeeCompetencyScores).values({ id, ...record, createdAt: ts });
  return { id, ...record, createdAt: ts };
}

export async function getEmployeeCompetencyHistory(employeeId: string) {
  return db.select().from(employeeCompetencyScores)
    .where(eq(employeeCompetencyScores.employeeId, employeeId))
    .orderBy(desc(employeeCompetencyScores.period));
}

export async function getTeamEffectiveness(teamId: string) {
  const members = await db.select({
    employeeId: teamMembers.employeeId,
    employeeName: employees.name,
    role: teamMembers.role,
  }).from(teamMembers)
    .leftJoin(employees, eq(teamMembers.employeeId, employees.id))
    .where(eq(teamMembers.teamId, teamId));

  // Get latest competency for each member
  const memberScores = await Promise.all(members.map(async (m) => {
    const [latest] = await db.select().from(employeeCompetencyScores)
      .where(eq(employeeCompetencyScores.employeeId, m.employeeId))
      .orderBy(desc(employeeCompetencyScores.period))
      .limit(1);
    return { ...m, competency: latest || null };
  }));

  const scores = memberScores.filter(m => m.competency).map(m => m.competency!.overallScore ?? 0);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  return { teamId, members: memberScores, avgScore };
}
