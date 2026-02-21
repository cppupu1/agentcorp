import { db, improvementProposals, employees, testRuns, observerFindings, errorTraces, subtasks, generateId, now } from '@agentcorp/db';
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import { AppError } from '../errors.js';

export async function diagnoseQualityIssue(employeeId: string) {
  const [emp] = await db.select({ id: employees.id, name: employees.name, systemPrompt: employees.systemPrompt })
    .from(employees).where(eq(employees.id, employeeId));
  if (!emp) throw new AppError('NOT_FOUND', `员工 ${employeeId} 不存在`);

  const d30 = new Date(Date.now() - 30 * 86400000).toISOString();

  // Gather recent test results
  const runs = await db.select({
    total: testRuns.totalScenarios,
    passed: testRuns.passedScenarios,
    failed: testRuns.failedScenarios,
    summary: testRuns.summary,
  }).from(testRuns)
    .where(and(eq(testRuns.employeeId, employeeId), gte(testRuns.createdAt, d30)))
    .orderBy(desc(testRuns.createdAt)).limit(10);

  // Gather recent errors
  const errors = await db.select({
    errorType: errorTraces.errorType,
    errorMessage: errorTraces.errorMessage,
    count: sql<number>`count(*)`,
  }).from(errorTraces)
    .innerJoin(subtasks, eq(errorTraces.subtaskId, subtasks.id))
    .where(and(eq(subtasks.assigneeId, employeeId), gte(errorTraces.createdAt, d30)))
    .groupBy(errorTraces.errorType, errorTraces.errorMessage)
    .orderBy(desc(sql`count(*)`)).limit(5);

  // Gather observer findings linked to this employee's subtasks
  const findings = await db.select({
    category: observerFindings.category,
    count: sql<number>`count(*)`,
  }).from(observerFindings)
    .innerJoin(subtasks, eq(observerFindings.relatedSubtaskId, subtasks.id))
    .where(and(gte(observerFindings.createdAt, d30), eq(subtasks.assigneeId, employeeId)))
    .groupBy(observerFindings.category)
    .orderBy(desc(sql`count(*)`));

  const totalTests = runs.reduce((s, r) => s + (r.total ?? 0), 0);
  const passedTests = runs.reduce((s, r) => s + (r.passed ?? 0), 0);
  const passRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : null;

  const diagnosis = {
    employeeId, employeeName: emp.name,
    period: '最近30天',
    testPassRate: passRate,
    topErrors: errors,
    observerIssues: findings,
    promptLength: emp.systemPrompt.length,
  };

  return diagnosis;
}

export async function generatePromptOptimization(employeeId: string, diagnosis: any) {
  const [emp] = await db.select({ id: employees.id, name: employees.name, systemPrompt: employees.systemPrompt })
    .from(employees).where(eq(employees.id, employeeId));
  if (!emp) throw new AppError('NOT_FOUND', `员工 ${employeeId} 不存在`);

  // Generate suggestion based on diagnosis
  const suggestions: string[] = [];
  if (diagnosis.testPassRate !== null && diagnosis.testPassRate < 80) {
    suggestions.push('测试通过率偏低，建议在系统提示中增加输出格式要求和质量检查步骤');
  }
  if (diagnosis.topErrors?.length > 0) {
    suggestions.push(`频繁出现错误类型: ${diagnosis.topErrors.map((e: any) => e.errorType).join(', ')}，建议增加错误处理指导`);
  }
  if (diagnosis.observerIssues?.length > 0) {
    suggestions.push(`观察者发现问题类别: ${diagnosis.observerIssues.map((f: any) => f.category).join(', ')}，建议针对性优化`);
  }
  if (diagnosis.promptLength > 5000) {
    suggestions.push('系统提示过长，建议精简核心指令');
  }

  const suggestion = JSON.stringify({
    before: emp.systemPrompt.slice(0, 200) + '...',
    recommendations: suggestions,
    reason: `基于${diagnosis.period}的数据分析`,
  });

  const id = generateId();
  const ts = now();
  await db.insert(improvementProposals).values({
    id, targetType: 'employee', targetId: employeeId,
    category: 'prompt_optimization',
    diagnosis: JSON.stringify(diagnosis),
    suggestion, status: 'pending',
    sourceData: JSON.stringify({ testPassRate: diagnosis.testPassRate }),
    createdAt: ts, updatedAt: ts,
  });

  return { id, suggestion: JSON.parse(suggestion) };
}

export async function listProposals(opts?: { targetType?: string; status?: string }) {
  const conditions = [];
  if (opts?.targetType) conditions.push(eq(improvementProposals.targetType, opts.targetType));
  if (opts?.status) conditions.push(eq(improvementProposals.status, opts.status));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db.select().from(improvementProposals).where(where).orderBy(desc(improvementProposals.createdAt));
}

export async function approveProposal(id: string) {
  const [p] = await db.select().from(improvementProposals).where(eq(improvementProposals.id, id));
  if (!p) throw new AppError('NOT_FOUND', `提案 ${id} 不存在`);
  if (p.status !== 'pending') throw new AppError('VALIDATION_ERROR', `提案状态为 ${p.status}，无法审批`);

  await db.update(improvementProposals).set({ status: 'approved', updatedAt: now() }).where(eq(improvementProposals.id, id));
  return { id, status: 'approved' };
}

export async function rejectProposal(id: string) {
  const [p] = await db.select().from(improvementProposals).where(eq(improvementProposals.id, id));
  if (!p) throw new AppError('NOT_FOUND', `提案 ${id} 不存在`);

  await db.update(improvementProposals).set({ status: 'rejected', updatedAt: now() }).where(eq(improvementProposals.id, id));
  return { id, status: 'rejected' };
}

export async function applyProposal(id: string) {
  const [p] = await db.select().from(improvementProposals).where(eq(improvementProposals.id, id));
  if (!p) throw new AppError('NOT_FOUND', `提案 ${id} 不存在`);
  if (p.status !== 'approved') throw new AppError('VALIDATION_ERROR', `提案需先审批才能应用`);

  await db.update(improvementProposals).set({ status: 'applied', appliedAt: now(), updatedAt: now() }).where(eq(improvementProposals.id, id));
  return { id, status: 'applied' };
}
