import { db, modelPricing, tokenUsageLogs, tasks, subtasks, models, employees, generateId, now } from '@agentcorp/db';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

/**
 * Calculate cost in micro-cents: (inputTokens * inputPrice + outputTokens * outputPrice) / 1_000_000
 * Prices are stored as integer cents per million tokens.
 */
function calculateCost(inputTokens: number, outputTokens: number, inputPrice: number | null, outputPrice: number | null): number {
  const ip = inputPrice ?? 0;
  const op = outputPrice ?? 0;
  return Math.round((inputTokens * ip + outputTokens * op) / 1_000_000);
}

export async function recordTokenUsage(params: {
  taskId: string;
  subtaskId?: string;
  employeeId?: string;
  modelId?: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  let cost = 0;
  if (params.modelId) {
    const [pricing] = await db.select().from(modelPricing).where(eq(modelPricing.modelId, params.modelId));
    if (pricing) {
      cost = calculateCost(params.inputTokens, params.outputTokens, pricing.inputPricePerMToken, pricing.outputPricePerMToken);
    }
  }

  await db.insert(tokenUsageLogs).values({
    id: generateId(),
    taskId: params.taskId,
    subtaskId: params.subtaskId ?? null,
    employeeId: params.employeeId ?? null,
    modelId: params.modelId ?? null,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    estimatedCost: cost,
    createdAt: now(),
  });

  // Update task actualCost atomically
  if (cost > 0) {
    await db.update(tasks).set({
      actualCost: sql`coalesce(${tasks.actualCost}, 0) + ${cost}`,
      updatedAt: now(),
    }).where(eq(tasks.id, params.taskId));
  }
}

export async function estimateTaskCost(taskId: string): Promise<number> {
  const taskSubs = await db.select({ id: subtasks.id }).from(subtasks).where(eq(subtasks.taskId, taskId));
  const subtaskCount = taskSubs.length;
  if (subtaskCount === 0) return 0;

  // Get average pricing across all models that have pricing
  const pricingRows = await db.select().from(modelPricing);
  if (pricingRows.length === 0) return 0;

  const avgInput = pricingRows.reduce((s, p) => s + (p.inputPricePerMToken ?? 0), 0) / pricingRows.length;
  const avgOutput = pricingRows.reduce((s, p) => s + (p.outputPricePerMToken ?? 0), 0) / pricingRows.length;

  // Estimate ~2000 input + ~1000 output tokens per subtask step, ~5 steps
  const estInputPerSubtask = 2000 * 5;
  const estOutputPerSubtask = 1000 * 5;
  const estimated = Math.round(subtaskCount * (estInputPerSubtask * avgInput + estOutputPerSubtask * avgOutput) / 1_000_000);

  await db.update(tasks).set({ estimatedCost: estimated, updatedAt: now() }).where(eq(tasks.id, taskId));
  return estimated;
}

export async function getTaskCostBreakdown(taskId: string) {
  const [task] = await db.select({
    estimatedCost: tasks.estimatedCost,
    actualCost: tasks.actualCost,
    budgetLimit: tasks.budgetLimit,
  }).from(tasks).where(eq(tasks.id, taskId));

  const logs = await db
    .select({
      employeeId: tokenUsageLogs.employeeId,
      employeeName: employees.name,
      subtaskId: tokenUsageLogs.subtaskId,
      subtaskTitle: subtasks.title,
      inputTokens: tokenUsageLogs.inputTokens,
      outputTokens: tokenUsageLogs.outputTokens,
      cost: tokenUsageLogs.estimatedCost,
    })
    .from(tokenUsageLogs)
    .leftJoin(employees, eq(tokenUsageLogs.employeeId, employees.id))
    .leftJoin(subtasks, eq(tokenUsageLogs.subtaskId, subtasks.id))
    .where(eq(tokenUsageLogs.taskId, taskId));

  // Aggregate by employee+subtask
  const map = new Map<string, {
    employeeId: string; employeeName: string;
    subtaskId: string | null; subtaskTitle: string | null;
    inputTokens: number; outputTokens: number; cost: number;
  }>();

  for (const log of logs) {
    const key = `${log.employeeId ?? '_'}:${log.subtaskId ?? '_'}`;
    const existing = map.get(key);
    if (existing) {
      existing.inputTokens += log.inputTokens ?? 0;
      existing.outputTokens += log.outputTokens ?? 0;
      existing.cost += log.cost ?? 0;
    } else {
      map.set(key, {
        employeeId: log.employeeId ?? '',
        employeeName: log.employeeName ?? 'PM',
        subtaskId: log.subtaskId,
        subtaskTitle: log.subtaskTitle,
        inputTokens: log.inputTokens ?? 0,
        outputTokens: log.outputTokens ?? 0,
        cost: log.cost ?? 0,
      });
    }
  }

  return {
    taskId,
    estimatedCost: task?.estimatedCost ?? null,
    actualCost: task?.actualCost ?? null,
    budgetLimit: task?.budgetLimit ?? null,
    breakdown: Array.from(map.values()),
  };
}

export async function getGlobalCostStats(startDate?: string, endDate?: string) {
  const conditions = [];
  if (startDate) conditions.push(gte(tokenUsageLogs.createdAt, startDate));
  if (endDate) conditions.push(lte(tokenUsageLogs.createdAt, endDate));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Aggregate totals using SQL
  const [totals] = await db
    .select({
      totalCost: sql<number>`coalesce(sum(${tokenUsageLogs.estimatedCost}), 0)`,
      totalTokens: sql<number>`coalesce(sum(${tokenUsageLogs.inputTokens}) + sum(${tokenUsageLogs.outputTokens}), 0)`,
      totalTasks: sql<number>`count(distinct ${tokenUsageLogs.taskId})`,
    })
    .from(tokenUsageLogs)
    .where(where);

  // Aggregate by model using SQL GROUP BY
  const byModel = await db
    .select({
      modelId: sql<string>`coalesce(${tokenUsageLogs.modelId}, '_unknown')`,
      modelName: sql<string>`coalesce(${models.name}, '未知')`,
      cost: sql<number>`coalesce(sum(${tokenUsageLogs.estimatedCost}), 0)`,
      tokens: sql<number>`coalesce(sum(${tokenUsageLogs.inputTokens}) + sum(${tokenUsageLogs.outputTokens}), 0)`,
    })
    .from(tokenUsageLogs)
    .leftJoin(models, eq(tokenUsageLogs.modelId, models.id))
    .where(where)
    .groupBy(tokenUsageLogs.modelId, models.name);

  return {
    totalCost: totals?.totalCost ?? 0,
    totalTasks: totals?.totalTasks ?? 0,
    totalTokens: totals?.totalTokens ?? 0,
    byModel,
  };
}
