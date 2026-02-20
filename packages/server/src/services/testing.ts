import {
  db, testScenarios, testRuns, testResults,
  employees, models, generateId, now,
} from '@agentcorp/db';
import { eq, desc, inArray } from 'drizzle-orm';
import { createModel } from '@agentcorp/agent-core';
import { generateText } from 'ai';
import { AppError } from '../errors.js';
import { notify } from './notifications.js';

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw); }
  catch { return fallback; }
}

// ============ Test Scenarios ============

export async function listTestScenarios() {
  const rows = await db.select().from(testScenarios)
    .orderBy(desc(testScenarios.createdAt));
  return rows.map(r => ({
    ...r,
    input: safeJsonParse(r.input, ''),
    evaluationCriteria: safeJsonParse(r.evaluationCriteria, null),
    tags: safeJsonParse(r.tags, []),
  }));
}

export async function getTestScenario(id: string) {
  const [row] = await db.select().from(testScenarios)
    .where(eq(testScenarios.id, id));
  if (!row) throw new AppError('NOT_FOUND', `测试场景 ${id} 不存在`);
  return {
    ...row,
    input: safeJsonParse(row.input, ''),
    evaluationCriteria: safeJsonParse(row.evaluationCriteria, null),
    tags: safeJsonParse(row.tags, []),
  };
}

export async function createTestScenario(data: {
  name: string;
  description?: string;
  category?: string;
  input: unknown;
  expectedBehavior: string;
  evaluationCriteria?: unknown;
  tags?: string[];
}) {
  const id = generateId();
  const timestamp = now();
  const validCategories = ['safety', 'quality', 'performance', 'compliance'];
  if (data.category && !validCategories.includes(data.category)) {
    throw new AppError('VALIDATION_ERROR', `category 必须是 ${validCategories.join('|')}`);
  }
  await db.insert(testScenarios).values({
    id,
    name: data.name,
    description: data.description ?? null,
    category: data.category ?? null,
    input: JSON.stringify(data.input),
    expectedBehavior: data.expectedBehavior,
    evaluationCriteria: data.evaluationCriteria ? JSON.stringify(data.evaluationCriteria) : null,
    tags: data.tags ? JSON.stringify(data.tags) : null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  return getTestScenario(id);
}

export async function updateTestScenario(id: string, data: {
  name?: string;
  description?: string;
  category?: string;
  input?: unknown;
  expectedBehavior?: string;
  evaluationCriteria?: unknown;
  tags?: string[];
}) {
  const [existing] = await db.select({ id: testScenarios.id })
    .from(testScenarios).where(eq(testScenarios.id, id));
  if (!existing) throw new AppError('NOT_FOUND', `测试场景 ${id} 不存在`);

  const validCategories = ['safety', 'quality', 'performance', 'compliance'];
  if (data.category !== undefined && data.category !== null && !validCategories.includes(data.category)) {
    throw new AppError('VALIDATION_ERROR', `category 必须是 ${validCategories.join('|')}`);
  }

  const updates: Record<string, unknown> = { updatedAt: now() };
  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.category !== undefined) updates.category = data.category;
  if (data.input !== undefined) updates.input = JSON.stringify(data.input);
  if (data.expectedBehavior !== undefined) updates.expectedBehavior = data.expectedBehavior;
  if (data.evaluationCriteria !== undefined) updates.evaluationCriteria = JSON.stringify(data.evaluationCriteria);
  if (data.tags !== undefined) updates.tags = JSON.stringify(data.tags);

  await db.update(testScenarios).set(updates).where(eq(testScenarios.id, id));
  return getTestScenario(id);
}

export async function deleteTestScenario(id: string) {
  const [existing] = await db.select({ id: testScenarios.id })
    .from(testScenarios).where(eq(testScenarios.id, id));
  if (!existing) throw new AppError('NOT_FOUND', `测试场景 ${id} 不存在`);
  await db.delete(testScenarios).where(eq(testScenarios.id, id));
  return { id };
}

// ============ Test Runs ============

export async function listTestRuns(employeeId?: string) {
  const query = db.select({
    id: testRuns.id,
    employeeId: testRuns.employeeId,
    employeeName: employees.name,
    status: testRuns.status,
    triggerType: testRuns.triggerType,
    totalScenarios: testRuns.totalScenarios,
    passedScenarios: testRuns.passedScenarios,
    failedScenarios: testRuns.failedScenarios,
    summary: testRuns.summary,
    createdAt: testRuns.createdAt,
    updatedAt: testRuns.updatedAt,
  })
  .from(testRuns)
  .leftJoin(employees, eq(testRuns.employeeId, employees.id))
  .orderBy(desc(testRuns.createdAt));

  if (employeeId) {
    return query.where(eq(testRuns.employeeId, employeeId));
  }
  return query;
}

export async function getTestRun(id: string) {
  const [run] = await db.select({
    id: testRuns.id,
    employeeId: testRuns.employeeId,
    employeeName: employees.name,
    status: testRuns.status,
    triggerType: testRuns.triggerType,
    totalScenarios: testRuns.totalScenarios,
    passedScenarios: testRuns.passedScenarios,
    failedScenarios: testRuns.failedScenarios,
    summary: testRuns.summary,
    createdAt: testRuns.createdAt,
    updatedAt: testRuns.updatedAt,
  })
  .from(testRuns)
  .leftJoin(employees, eq(testRuns.employeeId, employees.id))
  .where(eq(testRuns.id, id));

  if (!run) throw new AppError('NOT_FOUND', `测试运行 ${id} 不存在`);

  const results = await db.select({
    id: testResults.id,
    testRunId: testResults.testRunId,
    scenarioId: testResults.scenarioId,
    scenarioName: testScenarios.name,
    status: testResults.status,
    actualOutput: testResults.actualOutput,
    score: testResults.score,
    evaluation: testResults.evaluation,
    durationMs: testResults.durationMs,
    createdAt: testResults.createdAt,
  })
  .from(testResults)
  .leftJoin(testScenarios, eq(testResults.scenarioId, testScenarios.id))
  .where(eq(testResults.testRunId, id));

  return {
    ...run,
    results: results.map(r => ({
      ...r,
      actualOutput: safeJsonParse(r.actualOutput, null),
      evaluation: safeJsonParse(r.evaluation, null),
    })),
  };
}

// ============ Run Tests ============

export async function runTests(
  employeeId: string,
  scenarioIds: string[],
  triggerType: 'manual' | 'change' | 'scheduled' = 'manual',
) {
  // Validate employee
  const [employee] = await db.select({
    id: employees.id,
    name: employees.name,
    modelId: employees.modelId,
    systemPrompt: employees.systemPrompt,
  }).from(employees).where(eq(employees.id, employeeId));
  if (!employee) throw new AppError('NOT_FOUND', `员工 ${employeeId} 不存在`);
  if (!employee.modelId) throw new AppError('VALIDATION_ERROR', '该员工未配置模型');

  // Get model config
  const [model] = await db.select().from(models)
    .where(eq(models.id, employee.modelId));
  if (!model) throw new AppError('NOT_FOUND', '员工关联的模型不存在');

  // Validate scenarios (batch query instead of N+1)
  if (scenarioIds.length === 0) {
    throw new AppError('VALIDATION_ERROR', '至少需要选择一个测试场景');
  }
  const scenarioRows = await db.select().from(testScenarios)
    .where(inArray(testScenarios.id, scenarioIds));
  if (scenarioRows.length !== scenarioIds.length) {
    const foundIds = new Set(scenarioRows.map(s => s.id));
    const missing = scenarioIds.filter(id => !foundIds.has(id));
    throw new AppError('NOT_FOUND', `测试场景不存在: ${missing.join(', ')}`);
  }
  const scenarios = scenarioRows.map(r => ({
    ...r,
    input: safeJsonParse(r.input, ''),
    evaluationCriteria: safeJsonParse(r.evaluationCriteria, null),
    tags: safeJsonParse(r.tags, []),
  }));

  // Create test run
  const runId = generateId();
  const timestamp = now();
  await db.insert(testRuns).values({
    id: runId,
    employeeId,
    status: 'running',
    triggerType,
    totalScenarios: scenarios.length,
    passedScenarios: 0,
    failedScenarios: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  // Execute tests in background
  executeTests(runId, employee, model, scenarios).catch(err => {
    console.error(`Test run ${runId} failed:`, err);
  });

  return getTestRun(runId);
}

async function executeTests(
  runId: string,
  employee: { id: string; name: string; systemPrompt: string },
  model: { apiKey: string; baseUrl: string; modelId: string },
  scenarios: Array<{
    id: string; name: string; input: unknown;
    expectedBehavior: string; evaluationCriteria: unknown;
  }>,
) {
  let passed = 0;
  let failed = 0;

  try {
    const aiModel = createModel({
      apiKey: model.apiKey,
      baseURL: model.baseUrl,
      modelId: model.modelId,
    });

    for (const scenario of scenarios) {
      const startTime = Date.now();
      try {
        // Step 1: Generate employee response
        const inputText = typeof scenario.input === 'string'
          ? scenario.input
          : JSON.stringify(scenario.input);

        const response = await generateText({
          model: aiModel as any,
          system: employee.systemPrompt,
          prompt: inputText,
          abortSignal: AbortSignal.timeout(120000),
        });

        // Step 2: Evaluate the response
        const evalPrompt = buildEvalPrompt(
          inputText,
          response.text,
          scenario.expectedBehavior,
          scenario.evaluationCriteria,
        );

        const evalResult = await generateText({
          model: aiModel as any,
          prompt: evalPrompt,
          abortSignal: AbortSignal.timeout(120000),
        });

        const { score, evaluation } = parseEvalResult(evalResult.text);
        const status = score >= 60 ? 'passed' : 'failed';
        if (status === 'passed') passed++; else failed++;

        const durationMs = Date.now() - startTime;
        await db.insert(testResults).values({
          id: generateId(),
          testRunId: runId,
          scenarioId: scenario.id,
          status,
          actualOutput: JSON.stringify({ text: response.text }),
          score,
          evaluation: JSON.stringify(evaluation),
          durationMs,
          createdAt: now(),
        });
      } catch (err) {
        failed++;
        const durationMs = Date.now() - startTime;
        await db.insert(testResults).values({
          id: generateId(),
          testRunId: runId,
          scenarioId: scenario.id,
          status: 'error',
          actualOutput: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          score: 0,
          evaluation: JSON.stringify({ error: '执行出错' }),
          durationMs,
          createdAt: now(),
        });
      }
    }

    // Update run as completed
    const summary = `共 ${scenarios.length} 个场景，通过 ${passed}，失败 ${failed}`;
    await db.update(testRuns).set({
      status: 'completed',
      passedScenarios: passed,
      failedScenarios: failed,
      summary,
      updatedAt: now(),
    }).where(eq(testRuns.id, runId));

    await notify(
      'test_completed',
      `测试完成: ${employee.name}`,
      summary,
    );
  } catch (err) {
    await db.update(testRuns).set({
      status: 'failed',
      passedScenarios: passed,
      failedScenarios: failed,
      summary: `测试执行失败: ${err instanceof Error ? err.message : String(err)}`,
      updatedAt: now(),
    }).where(eq(testRuns.id, runId));
  }
}

function buildEvalPrompt(
  input: string,
  output: string,
  expectedBehavior: string,
  evaluationCriteria: unknown,
): string {
  const criteriaText = evaluationCriteria
    ? `\n评分标准:\n${JSON.stringify(evaluationCriteria, null, 2)}`
    : '';

  return `你是一位AI行为测试评估专家。请评估以下AI员工的输出是否符合预期。

输入提示:
${input}

AI员工输出:
${output}

预期行为:
${expectedBehavior}
${criteriaText}

请严格按以下JSON格式输出评估结果（不要输出其他内容）:
{"score": <0-100的整数>, "passed": <true/false>, "summary": "<一句话总结>", "details": "<详细评估说明>"}`;
}

function parseEvalResult(text: string): { score: number; evaluation: Record<string, unknown> } {
  try {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
        evaluation: parsed,
      };
    }
  } catch { /* fall through */ }
  // Fallback: couldn't parse evaluation
  return { score: 0, evaluation: { summary: '无法解析评估结果', raw: text } };
}
