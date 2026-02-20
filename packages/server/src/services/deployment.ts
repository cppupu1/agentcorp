import { db, deploymentStages, stageEvaluations, employees, teams, subtasks, tasks, generateId, now } from '@agentcorp/db';
import { eq, desc, and, inArray, sql } from 'drizzle-orm';
import { AppError } from '../errors.js';

const STAGES = ['simulation', 'shadow', 'limited_auto', 'full_auto'] as const;
type Stage = typeof STAGES[number];

const PROMOTION_CRITERIA: Record<string, { minTasks: number; minSuccessRate: number }> = {
  'simulation->shadow': { minTasks: 5, minSuccessRate: 0.8 },
  'shadow->limited_auto': { minTasks: 10, minSuccessRate: 0.9 },
  'limited_auto->full_auto': { minTasks: 20, minSuccessRate: 0.95 },
};

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw); }
  catch { return fallback; }
}

function nextStage(stage: Stage): Stage | null {
  const idx = STAGES.indexOf(stage);
  return idx < STAGES.length - 1 ? STAGES[idx + 1] : null;
}

function prevStage(stage: Stage): Stage | null {
  const idx = STAGES.indexOf(stage);
  return idx > 0 ? STAGES[idx - 1] : null;
}

export async function listDeploymentStages() {
  const rows = await db.select({
    id: deploymentStages.id,
    employeeId: deploymentStages.employeeId,
    employeeName: employees.name,
    teamId: deploymentStages.teamId,
    teamName: teams.name,
    stage: deploymentStages.stage,
    promotedAt: deploymentStages.promotedAt,
    promotedBy: deploymentStages.promotedBy,
    config: deploymentStages.config,
    createdAt: deploymentStages.createdAt,
    updatedAt: deploymentStages.updatedAt,
  })
  .from(deploymentStages)
  .leftJoin(employees, eq(deploymentStages.employeeId, employees.id))
  .leftJoin(teams, eq(deploymentStages.teamId, teams.id))
  .orderBy(desc(deploymentStages.updatedAt));

  return rows.map(r => ({ ...r, config: safeJsonParse(r.config, {}), teamName: r.teamName || '' }));
}

export async function getDeploymentStage(id: string) {
  const [row] = await db.select({
    id: deploymentStages.id,
    employeeId: deploymentStages.employeeId,
    employeeName: employees.name,
    teamId: deploymentStages.teamId,
    teamName: teams.name,
    stage: deploymentStages.stage,
    promotedAt: deploymentStages.promotedAt,
    promotedBy: deploymentStages.promotedBy,
    config: deploymentStages.config,
    createdAt: deploymentStages.createdAt,
    updatedAt: deploymentStages.updatedAt,
  })
  .from(deploymentStages)
  .leftJoin(employees, eq(deploymentStages.employeeId, employees.id))
  .leftJoin(teams, eq(deploymentStages.teamId, teams.id))
  .where(eq(deploymentStages.id, id));

  if (!row) throw new AppError('NOT_FOUND', `部署阶段 ${id} 不存在`);

  const evals = await db.select({
    id: stageEvaluations.id,
    deploymentStageId: stageEvaluations.deploymentStageId,
    fromStage: stageEvaluations.fromStage,
    toStage: stageEvaluations.toStage,
    result: stageEvaluations.result,
    metrics: stageEvaluations.metrics,
    reason: stageEvaluations.reason,
    createdAt: stageEvaluations.createdAt,
  })
  .from(stageEvaluations)
  .where(eq(stageEvaluations.deploymentStageId, id))
  .orderBy(desc(stageEvaluations.createdAt));

  return {
    ...row,
    config: safeJsonParse(row.config, {}),
    teamName: row.teamName || '',
    evaluations: evals.map(e => ({ ...e, metrics: safeJsonParse(e.metrics, {}) })),
  };
}

export async function createDeploymentStage(employeeId: string, teamId?: string) {
  // Validate employee exists
  const [emp] = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, employeeId));
  if (!emp) throw new AppError('NOT_FOUND', `员工 ${employeeId} 不存在`);

  // Validate team if provided
  if (teamId) {
    const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId));
    if (!team) throw new AppError('NOT_FOUND', `团队 ${teamId} 不存在`);
  }

  // Check for existing deployment stage for this employee
  const [existingStage] = await db.select({ id: deploymentStages.id })
    .from(deploymentStages)
    .where(eq(deploymentStages.employeeId, employeeId));
  if (existingStage) {
    throw new AppError('CONFLICT', '该员工已有部署阶段记录');
  }

  const id = generateId();
  const timestamp = now();

  await db.insert(deploymentStages).values({
    id,
    employeeId,
    teamId: teamId || null,
    stage: 'simulation',
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  return getDeploymentStage(id);
}

/** Compute task metrics for an employee */
async function getEmployeeMetrics(employeeId: string) {
  // Count subtasks assigned to this employee
  const allSubtasks = await db.select({
    status: subtasks.status,
  })
  .from(subtasks)
  .where(eq(subtasks.assigneeId, employeeId));

  const total = allSubtasks.length;
  const completed = allSubtasks.filter(s => s.status === 'completed').length;
  const failed = allSubtasks.filter(s => s.status === 'failed').length;
  const successRate = total > 0 ? completed / total : 0;

  return { taskCount: total, completedCount: completed, failedCount: failed, successRate };
}

export async function evaluatePromotion(id: string) {
  const stage = await getDeploymentStage(id);
  const currentStage = stage.stage as Stage;
  const next = nextStage(currentStage);

  if (!next) throw new AppError('VALIDATION_ERROR', '已处于最高阶段，无法继续晋升');

  const key = `${currentStage}->${next}`;
  const criteria = PROMOTION_CRITERIA[key];
  if (!criteria) throw new AppError('INTERNAL_ERROR', `未找到晋升条件: ${key}`);

  const metrics = await getEmployeeMetrics(stage.employeeId);
  const meetsTaskCount = metrics.completedCount >= criteria.minTasks;
  const meetsSuccessRate = metrics.successRate >= criteria.minSuccessRate;
  const shouldPromote = meetsTaskCount && meetsSuccessRate;

  const reasons: string[] = [];
  if (!meetsTaskCount) reasons.push(`已完成任务数 ${metrics.completedCount} < 要求 ${criteria.minTasks}`);
  if (!meetsSuccessRate) reasons.push(`成功率 ${(metrics.successRate * 100).toFixed(1)}% < 要求 ${(criteria.minSuccessRate * 100)}%`);
  if (shouldPromote) reasons.push(`满足所有条件: 完成 ${metrics.completedCount} 个任务, 成功率 ${(metrics.successRate * 100).toFixed(1)}%`);

  const evalId = generateId();
  const timestamp = now();

  await db.insert(stageEvaluations).values({
    id: evalId,
    deploymentStageId: id,
    fromStage: currentStage,
    toStage: next,
    result: shouldPromote ? 'promoted' : 'rejected',
    metrics: JSON.stringify(metrics),
    reason: reasons.join('; '),
    createdAt: timestamp,
  });

  // Auto-promote if criteria met
  if (shouldPromote) {
    await db.update(deploymentStages).set({
      stage: next,
      promotedAt: timestamp,
      promotedBy: 'auto',
      updatedAt: timestamp,
    }).where(eq(deploymentStages.id, id));
  }

  return getDeploymentStage(id);
}

export async function promoteStage(id: string) {
  const stage = await getDeploymentStage(id);
  const currentStage = stage.stage as Stage;
  const next = nextStage(currentStage);

  if (!next) throw new AppError('VALIDATION_ERROR', '已处于最高阶段，无法继续晋升');

  const timestamp = now();
  const evalId = generateId();

  await db.insert(stageEvaluations).values({
    id: evalId,
    deploymentStageId: id,
    fromStage: currentStage,
    toStage: next,
    result: 'promoted',
    reason: '手动晋升',
    createdAt: timestamp,
  });

  await db.update(deploymentStages).set({
    stage: next,
    promotedAt: timestamp,
    promotedBy: 'manual',
    updatedAt: timestamp,
  }).where(eq(deploymentStages.id, id));

  return getDeploymentStage(id);
}

export async function demoteStage(id: string) {
  const stage = await getDeploymentStage(id);
  const currentStage = stage.stage as Stage;
  const prev = prevStage(currentStage);

  if (!prev) throw new AppError('VALIDATION_ERROR', '已处于最低阶段，无法降级');

  const timestamp = now();
  const evalId = generateId();

  await db.insert(stageEvaluations).values({
    id: evalId,
    deploymentStageId: id,
    fromStage: currentStage,
    toStage: prev,
    result: 'demoted',
    reason: '手动降级',
    createdAt: timestamp,
  });

  await db.update(deploymentStages).set({
    stage: prev,
    promotedAt: timestamp,
    promotedBy: 'manual',
    updatedAt: timestamp,
  }).where(eq(deploymentStages.id, id));

  return getDeploymentStage(id);
}

export async function deleteDeploymentStage(id: string) {
  const [existing] = await db.select({ id: deploymentStages.id }).from(deploymentStages).where(eq(deploymentStages.id, id));
  if (!existing) throw new AppError('NOT_FOUND', `部署阶段 ${id} 不存在`);

  // Atomic cascade delete evaluations + stage
  db.transaction((tx) => {
    tx.delete(stageEvaluations).where(eq(stageEvaluations.deploymentStageId, id)).run();
    tx.delete(deploymentStages).where(eq(deploymentStages.id, id)).run();
  });
  return { id };
}

export async function getEmployeeStage(employeeId: string) {
  const [row] = await db.select({
    id: deploymentStages.id,
    stage: deploymentStages.stage,
  })
  .from(deploymentStages)
  .where(eq(deploymentStages.employeeId, employeeId))
  .orderBy(desc(deploymentStages.updatedAt))
  .limit(1);

  return row || null;
}
