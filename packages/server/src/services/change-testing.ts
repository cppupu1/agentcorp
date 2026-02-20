import { db, changeTestConfigs, changeTestRuns, employees, generateId, now } from '@agentcorp/db';
import { eq, and, or, desc, isNull } from 'drizzle-orm';
import { AppError } from '../errors.js';
import { runTests } from './testing.js';
import { notify } from './notifications.js';

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw); }
  catch { return fallback; }
}

export async function listChangeTestConfigs() {
  return db.select().from(changeTestConfigs).orderBy(desc(changeTestConfigs.createdAt));
}

export async function getChangeTestConfig(id: string) {
  const [config] = await db.select().from(changeTestConfigs).where(eq(changeTestConfigs.id, id));
  if (!config) throw new AppError('NOT_FOUND', `变更测试配置 ${id} 不存在`);

  const runs = await db.select().from(changeTestRuns)
    .where(eq(changeTestRuns.configId, id))
    .orderBy(desc(changeTestRuns.createdAt))
    .limit(20);

  return { ...config, runs };
}

interface CreateInput {
  name: string;
  watchTarget: string;
  watchId?: string | null;
  scenarioIds: string[];
  enabled?: boolean;
}

export async function createChangeTestConfig(data: CreateInput) {
  const id = generateId();
  const timestamp = now();
  const [row] = await db.insert(changeTestConfigs).values({
    id,
    name: data.name,
    watchTarget: data.watchTarget,
    watchId: data.watchId ?? null,
    scenarioIds: JSON.stringify(data.scenarioIds),
    enabled: data.enabled !== false ? 1 : 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  }).returning();
  return row;
}

export async function updateChangeTestConfig(id: string, data: Partial<CreateInput>) {
  const [existing] = await db.select().from(changeTestConfigs).where(eq(changeTestConfigs.id, id));
  if (!existing) throw new AppError('NOT_FOUND', `变更测试配置 ${id} 不存在`);

  const updates: Record<string, unknown> = { updatedAt: now() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.watchTarget !== undefined) updates.watchTarget = data.watchTarget;
  if (data.watchId !== undefined) updates.watchId = data.watchId ?? null;
  if (data.scenarioIds !== undefined) updates.scenarioIds = JSON.stringify(data.scenarioIds);
  if (data.enabled !== undefined) updates.enabled = data.enabled ? 1 : 0;

  const [row] = await db.update(changeTestConfigs).set(updates).where(eq(changeTestConfigs.id, id)).returning();
  return row;
}

export async function deleteChangeTestConfig(id: string) {
  const [existing] = await db.select().from(changeTestConfigs).where(eq(changeTestConfigs.id, id));
  if (!existing) throw new AppError('NOT_FOUND', `变更测试配置 ${id} 不存在`);
  await db.delete(changeTestConfigs).where(eq(changeTestConfigs.id, id));
  return { id };
}

/**
 * Core function: find matching configs and trigger tests.
 * changeType: 'employee_updated' | 'model_updated' | 'tool_updated' | 'prompt_updated'
 * changeId: the ID of the changed entity
 * changeDetail: JSON-serializable object describing what changed
 */
export async function triggerChangeTests(
  changeType: string,
  changeId: string,
  changeDetail: Record<string, unknown>,
) {
  // Map changeType to watchTarget
  const targetMap: Record<string, string> = {
    employee_updated: 'employee',
    model_updated: 'model',
    tool_updated: 'tool',
    prompt_updated: 'prompt',
  };
  const watchTarget = targetMap[changeType];
  if (!watchTarget) return;

  // Find enabled configs matching this change (single query)
  const matchedConfigs = await db.select().from(changeTestConfigs)
    .where(
      and(
        eq(changeTestConfigs.enabled, 1),
        eq(changeTestConfigs.watchTarget, watchTarget),
        or(
          eq(changeTestConfigs.watchId, changeId),
          isNull(changeTestConfigs.watchId),
          eq(changeTestConfigs.watchId, ''),
        ),
      ),
    );

  if (matchedConfigs.length === 0) return;

  // Determine employeeId to test
  if (watchTarget === 'model') {
    // Find employees using this model and test them
    const emps = await db.select({ id: employees.id }).from(employees)
      .where(eq(employees.modelId, changeId));
    if (emps.length === 0) return;
    for (const config of matchedConfigs) {
      const scenarioIds = safeJsonParse<string[]>(config.scenarioIds, []);
      if (scenarioIds.length === 0) continue;
      for (const emp of emps) {
        const testRun = await runTests(emp.id, scenarioIds, 'change');
        await db.insert(changeTestRuns).values({
          id: generateId(),
          configId: config.id,
          testRunId: testRun.id,
          changeType,
          changeDetail: JSON.stringify(changeDetail),
          createdAt: now(),
        });
      }
      await db.update(changeTestConfigs)
        .set({ lastTriggeredAt: now(), updatedAt: now() })
        .where(eq(changeTestConfigs.id, config.id));
    }
    await notify('change_test', '变更测试已触发', `模型变更触发了 ${matchedConfigs.length} 个测试配置`);
    return;
  }

  if (watchTarget !== 'employee') {
    // tool/prompt changes: no direct employee mapping, skip
    console.warn(`Change test for ${watchTarget} (${changeId}): no employee mapping, skipping`);
    return;
  }

  // For employee changes, test the employee directly
  for (const config of matchedConfigs) {
    const scenarioIds = safeJsonParse<string[]>(config.scenarioIds, []);
    if (scenarioIds.length === 0) continue;
    const testRun = await runTests(changeId, scenarioIds, 'change');
    await db.insert(changeTestRuns).values({
      id: generateId(),
      configId: config.id,
      testRunId: testRun.id,
      changeType,
      changeDetail: JSON.stringify(changeDetail),
      createdAt: now(),
    });
    await db.update(changeTestConfigs)
      .set({ lastTriggeredAt: now(), updatedAt: now() })
      .where(eq(changeTestConfigs.id, config.id));
  }

  await notify('change_test', '变更测试已触发', `${watchTarget} 变更触发了 ${matchedConfigs.length} 个测试配置`);
}
