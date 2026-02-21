import { db, testRuns, observerFindings, employees } from '@agentcorp/db';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';

export async function getQualityTrend(startDate?: string, endDate?: string, granularity: string = 'day') {
  const conditions = [];
  if (startDate) conditions.push(gte(testRuns.createdAt, startDate));
  if (endDate) conditions.push(lte(testRuns.createdAt, endDate));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const dateFn = granularity === 'month'
    ? sql<string>`substr(${testRuns.createdAt}, 1, 7)`
    : sql<string>`substr(${testRuns.createdAt}, 1, 10)`;

  const rows = await db
    .select({
      period: dateFn,
      totalRuns: sql<number>`count(*)`,
      totalScenarios: sql<number>`coalesce(sum(${testRuns.totalScenarios}), 0)`,
      passedScenarios: sql<number>`coalesce(sum(${testRuns.passedScenarios}), 0)`,
      failedScenarios: sql<number>`coalesce(sum(${testRuns.failedScenarios}), 0)`,
    })
    .from(testRuns)
    .where(where)
    .groupBy(dateFn)
    .orderBy(dateFn);

  // Observer findings trend
  const findingConditions = [];
  if (startDate) findingConditions.push(gte(observerFindings.createdAt, startDate));
  if (endDate) findingConditions.push(lte(observerFindings.createdAt, endDate));
  const findingWhere = findingConditions.length > 0 ? and(...findingConditions) : undefined;

  const findingDateFn = granularity === 'month'
    ? sql<string>`substr(${observerFindings.createdAt}, 1, 7)`
    : sql<string>`substr(${observerFindings.createdAt}, 1, 10)`;

  const findings = await db
    .select({
      period: findingDateFn,
      total: sql<number>`count(*)`,
      critical: sql<number>`sum(case when ${observerFindings.severity} = 'critical' then 1 else 0 end)`,
      warning: sql<number>`sum(case when ${observerFindings.severity} = 'warning' then 1 else 0 end)`,
    })
    .from(observerFindings)
    .where(findingWhere)
    .groupBy(findingDateFn)
    .orderBy(findingDateFn);

  return { testTrend: rows, findingTrend: findings };
}

export async function getEmployeeQualityRanking() {
  const rows = await db
    .select({
      employeeId: testRuns.employeeId,
      employeeName: employees.name,
      totalRuns: sql<number>`count(*)`,
      totalScenarios: sql<number>`coalesce(sum(${testRuns.totalScenarios}), 0)`,
      passedScenarios: sql<number>`coalesce(sum(${testRuns.passedScenarios}), 0)`,
      passRate: sql<number>`case when sum(${testRuns.totalScenarios}) > 0 then round(sum(${testRuns.passedScenarios}) * 100.0 / sum(${testRuns.totalScenarios})) else 0 end`,
    })
    .from(testRuns)
    .leftJoin(employees, eq(testRuns.employeeId, employees.id))
    .groupBy(testRuns.employeeId, employees.name)
    .orderBy(desc(sql`case when sum(${testRuns.totalScenarios}) > 0 then round(sum(${testRuns.passedScenarios}) * 100.0 / sum(${testRuns.totalScenarios})) else 0 end`));

  return rows;
}

export async function getQualityAlerts() {
  // Employees with recent quality drops: compare last 7 days vs previous 7 days
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 86400000).toISOString();
  const d14 = new Date(now.getTime() - 14 * 86400000).toISOString();

  const recent = await db
    .select({
      employeeId: testRuns.employeeId,
      employeeName: employees.name,
      passed: sql<number>`coalesce(sum(${testRuns.passedScenarios}), 0)`,
      total: sql<number>`coalesce(sum(${testRuns.totalScenarios}), 0)`,
    })
    .from(testRuns)
    .leftJoin(employees, eq(testRuns.employeeId, employees.id))
    .where(gte(testRuns.createdAt, d7))
    .groupBy(testRuns.employeeId, employees.name);

  const previous = await db
    .select({
      employeeId: testRuns.employeeId,
      passed: sql<number>`coalesce(sum(${testRuns.passedScenarios}), 0)`,
      total: sql<number>`coalesce(sum(${testRuns.totalScenarios}), 0)`,
    })
    .from(testRuns)
    .where(and(gte(testRuns.createdAt, d14), lte(testRuns.createdAt, d7)))
    .groupBy(testRuns.employeeId);

  const prevMap = new Map(previous.map(p => [p.employeeId, p.total > 0 ? p.passed / p.total : null]));

  const alerts: Array<{ employeeId: string; employeeName: string; currentRate: number; previousRate: number; drop: number }> = [];
  for (const r of recent) {
    const currentRate = r.total > 0 ? r.passed / r.total : 1;
    const previousRate = prevMap.get(r.employeeId);
    if (previousRate === null || previousRate === undefined) continue; // skip employees with no previous data
    const drop = previousRate - currentRate;
    if (drop > 0.1) { // >10% drop
      alerts.push({
        employeeId: r.employeeId,
        employeeName: r.employeeName ?? '',
        currentRate: Math.round(currentRate * 100),
        previousRate: Math.round(previousRate * 100),
        drop: Math.round(drop * 100),
      });
    }
  }

  // Also include critical observer findings from last 24h
  const d1 = new Date(now.getTime() - 86400000).toISOString();
  const criticalFindings = await db
    .select({
      id: observerFindings.id,
      taskId: observerFindings.taskId,
      description: observerFindings.description,
      createdAt: observerFindings.createdAt,
    })
    .from(observerFindings)
    .where(and(eq(observerFindings.severity, 'critical'), gte(observerFindings.createdAt, d1)));

  return { qualityDropAlerts: alerts, criticalFindings };
}
