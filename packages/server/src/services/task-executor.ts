import { db, tasks, subtasks, employees, models, employeeTools, tools, teamTools, teams, generateId, now } from '@agentcorp/db';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { AgentRunner, createModel } from '@agentcorp/agent-core';
import type { MCPToolConfig, AgentStreamCallbacks } from '@agentcorp/agent-core';
import { tool, jsonSchema } from 'ai';
import type { ToolSet } from 'ai';
import { sseManager } from './sse-manager.js';
import { getSetting } from './system.js';
import { recordTokenUsage } from './cost-tracker.js';
import { validateSubtaskOutput, handleSubtaskFailure } from './error-protection.js';
import { logDecision, logToolCall } from './observability.js';
import { getCollaborationStrategy } from './collaboration/index.js';
import { runObserverCheck } from './observer.js';
import { createIncidentReport } from './incidents.js';
import { recordEvidence } from './evidence.js';

function sanitizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // Strip potential API keys / tokens from error messages
  return msg.replace(/sk-[a-zA-Z0-9_-]{10,}/g, 'sk-***').replace(/key[=:]\s*["']?[a-zA-Z0-9_-]{20,}/gi, 'key=***');
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw); }
  catch { return fallback; }
}

const SUBTASK_TIMEOUT_MS = 300_000; // 5 minutes

function getNumericSetting(key: string, defaultValue: number): number {
  const val = getSetting(key);
  if (!val) return defaultValue;
  const num = parseInt(val, 10);
  return isNaN(num) ? defaultValue : num;
}

// Track running executions for cleanup
const activeExecutions = new Map<string, AbortController>();
const activePromises = new Map<string, Promise<void>>();

export function isTaskExecuting(taskId: string): boolean {
  return activeExecutions.has(taskId);
}

export async function cancelAllExecutions(): Promise<void> {
  for (const ac of activeExecutions.values()) {
    ac.abort();
  }
  await Promise.allSettled(activePromises.values());
}

/**
 * Start task execution in background. Called after plan approval.
 * PM Agent orchestrates subtask assignment via meta-tools.
 */
export async function startTaskExecution(taskId: string): Promise<void> {
  if (activeExecutions.has(taskId)) {
    console.warn(`Task ${taskId} is already executing, skipping duplicate start`);
    return;
  }
  const abort = new AbortController();
  activeExecutions.set(taskId, abort);

  // Run in background — don't await
  const promise = runExecution(taskId, abort.signal).catch(async (err) => {
    console.error(`Task ${taskId} execution failed:`, err);
    try {
      const [t] = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, taskId));
      if (t?.status === 'executing') {
        await failTask(taskId, `执行异常: ${sanitizeError(err)}`);
      }
    } catch (dbErr) {
      console.error(`Failed to mark task ${taskId} as failed:`, dbErr);
    }
  }).finally(() => {
    activeExecutions.delete(taskId);
    activePromises.delete(taskId);
  });
  activePromises.set(taskId, promise);
}

/** Recover tasks stuck in 'executing' after server restart */
export async function recoverStuckTasks(): Promise<void> {
  const stuck = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.status, 'executing'));
  for (const t of stuck) {
    // Skip tasks that are actively executing (started between listen and recovery)
    if (activeExecutions.has(t.id)) {
      console.log(`Task ${t.id} is actively executing, skipping recovery`);
      continue;
    }
    // Reset subtasks stuck in 'running'
    await db.update(subtasks)
      .set({ status: 'failed', output: JSON.stringify({ error: '服务器重启，执行中断' }), updatedAt: now() })
      .where(and(eq(subtasks.taskId, t.id), eq(subtasks.status, 'running')));
    await failTask(t.id, '服务器重启，任务执行中断');
  }
}

async function runExecution(taskId: string, signal: AbortSignal): Promise<void> {
  // Task-level timeout
  const timeoutMinutes = getNumericSetting('task_timeout_minutes', 30);
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const raceCleanup = new AbortController();
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => reject(new Error(`任务执行超时（${timeoutMinutes}分钟）`)), timeoutMs);
    raceCleanup.signal.addEventListener('abort', () => clearTimeout(timer));
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Task execution aborted'));
    }, { signal: raceCleanup.signal });
  });

  await Promise.race([
    runExecutionInner(taskId, signal),
    timeoutPromise,
  ]).finally(() => raceCleanup.abort());
}

async function runExecutionInner(taskId: string, signal: AbortSignal): Promise<void> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task || task.status !== 'executing') return;

  const teamConfig = safeJsonParse<any>(task.teamConfig, { pm: null, members: [] });
  const brief = safeJsonParse<any>(task.brief, {});
  const plan = safeJsonParse<any>(task.plan, { subtasks: [] });

  if (!teamConfig.pm?.id || !task.teamId) {
    await failTask(taskId, '任务未配置PM或团队');
    return;
  }

  // Check collaboration mode — delegate to strategy if non-free
  const [teamRow] = await db.select({ collaborationMode: teams.collaborationMode }).from(teams).where(eq(teams.id, task.teamId!));
  const collabMode = teamRow?.collaborationMode || 'free';

  if (collabMode !== 'free') {
    const strategy = getCollaborationStrategy(collabMode);
    if (strategy) {
      await strategy.execute({ taskId, teamId: task.teamId!, brief, plan, teamConfig, signal });
      return;
    }
  }

  // Load PM employee + model
  const [pm] = await db.select().from(employees).where(eq(employees.id, teamConfig.pm.id));
  if (!pm || !pm.modelId) {
    await failTask(taskId, 'PM员工不存在或未配置模型');
    return;
  }
  const [pmModel] = await db.select().from(models).where(eq(models.id, pm.modelId));
  if (!pmModel) {
    await failTask(taskId, 'PM模型不存在');
    return;
  }

  // Load all subtasks from DB
  const taskSubtasks = await db.select().from(subtasks).where(eq(subtasks.taskId, taskId)).orderBy(subtasks.sortOrder);
  if (taskSubtasks.length === 0) {
    await failTask(taskId, '没有子任务可执行');
    return;
  }

  // Load team tools for employee execution
  const teamToolRows = await db
    .select({ toolId: teamTools.toolId })
    .from(teamTools)
    .where(eq(teamTools.teamId, task.teamId!));
  const teamToolIds = teamToolRows.map(r => r.toolId);

  // Build member info for PM prompt
  const memberInfo = teamConfig.members?.map((m: any) =>
    `- ${m.name} (ID: ${m.id}): ${m.taskPrompt || '无特定指导'}`
  ).join('\n') || '无成员';

  const subtaskInfo = taskSubtasks.map((st, i) =>
    `${i + 1}. [${st.id}] ${st.title}${st.description ? ` - ${st.description}` : ''} (负责人: ${st.assigneeId || '未分配'}, 依赖: ${safeJsonParse(st.dependsOn, []).join(', ') || '无'})`
  ).join('\n');

  // PM orchestration prompt
  const pmPrompt = `${pm.systemPrompt}

你现在是项目经理，正在执行一个已批准的任务。

任务书：
${JSON.stringify(brief, null, 2)}

参与成员：
${memberInfo}

执行计划（子任务列表）：
${subtaskInfo}

你的职责：
1. 按照执行计划的依赖关系，依次调用 assign_subtask 将子任务分配给对应员工执行
2. 审查每个子任务的执行结果，如果不满意可以重新分配（最多重试2次）
3. 注意依赖关系：被依赖的子任务必须先完成
4. 所有子任务完成后，调用 complete_task 生成最终交付物
5. 如果某个子任务多次失败，可以跳过并在最终报告中说明

请开始执行任务。按照子任务的依赖顺序逐个分配执行。`;

  // Circuit breaker state
  let consecutiveFailures = 0;
  const circuitBreakerThreshold = getNumericSetting('circuit_breaker_threshold', 3);
  const taskTokenLimit = getNumericSetting('task_token_limit', 500000);

  // PM meta-tools
  const pmTools: ToolSet = {
    assign_subtask: tool<unknown, string>({
      description: '将子任务分配给团队成员执行。返回员工的执行结果。',
      inputSchema: jsonSchema({
        type: 'object' as const,
        properties: {
          subtaskId: { type: 'string', description: '子任务ID' },
          employeeId: { type: 'string', description: '负责员工ID' },
          instruction: { type: 'string', description: '给员工的具体指令和上下文' },
        },
        required: ['subtaskId', 'employeeId', 'instruction'],
      }),
      execute: async (args) => {
        const { subtaskId, employeeId, instruction } = args as { subtaskId: string; employeeId: string; instruction: string };
        // Validate employeeId is a team member
        const validIds = new Set((teamConfig.members ?? []).map((m: any) => m.id));
        if (!validIds.has(employeeId)) {
          return `[错误] 员工 ${employeeId} 不是当前团队成员`;
        }

        // Check task token limit before executing
        const [currentTask] = await db.select({ tokenUsage: tasks.tokenUsage }).from(tasks).where(eq(tasks.id, taskId));
        if (currentTask && (currentTask.tokenUsage ?? 0) >= taskTokenLimit) {
          await pauseTask(taskId, `任务 Token 用量已达上限 (${taskTokenLimit})`);
          return `[熔断] 任务 Token 用量已达上限，任务已暂停`;
        }

        const result = await executeSubtask(taskId, subtaskId, employeeId, instruction, teamToolIds, signal, { teamId: task.teamId!, brief });

        // Circuit breaker: track consecutive failures
        if (result.startsWith('[子任务执行失败]')) {
          consecutiveFailures++;
          if (consecutiveFailures >= circuitBreakerThreshold) {
            await pauseTask(taskId, `连续 ${consecutiveFailures} 个子任务失败，触发熔断`);
            // Auto-create incident report for circuit breaker
            createIncidentReport(taskId, 'circuit_breaker').catch(err => {
              console.error(`Failed to create incident report for circuit breaker on task ${taskId}:`, err);
            });
            return `[熔断] 连续 ${consecutiveFailures} 个子任务失败，任务已暂停`;
          }
        } else {
          consecutiveFailures = 0; // Reset on success
        }

        return result;
      },
    }),

    complete_task: tool<unknown, string>({
      description: '标记任务完成并生成最终交付物。所有子任务完成后调用。',
      inputSchema: jsonSchema({
        type: 'object' as const,
        properties: {
          summary: { type: 'string', description: '任务总结' },
          deliverables: { type: 'string', description: '交付物内容' },
        },
        required: ['summary', 'deliverables'],
      }),
      execute: async (args) => {
        const { summary, deliverables } = args as { summary: string; deliverables: string };
        await completeTask(taskId, summary, deliverables);
        return '任务已完成。';
      },
    }),
  };

  const aiModel = createModel({
    apiKey: pmModel.apiKey,
    baseURL: pmModel.baseUrl,
    modelId: pmModel.modelId,
  });

  const runner = new AgentRunner({
    model: aiModel as any,
    systemPrompt: pmPrompt,
    mcpToolConfigs: [],
    internalTools: pmTools,
    maxSteps: 50, // PM needs many steps to orchestrate all subtasks
  });

  let taskFinalized = false;

  // Duration tracking for PM tool calls
  const pmToolStartTimes = new Map<string, number>();

  const callbacks: AgentStreamCallbacks = {
    onTextDelta: () => {}, // PM text not streamed to client
    onToolCall: (id, toolName, args) => {
      pmToolStartTimes.set(id, Date.now());
      // Sanitize: don't leak full instructions to frontend
      const safeArgs = toolName === 'assign_subtask'
        ? { subtaskId: (args as any).subtaskId, employeeId: (args as any).employeeId }
        : {};
      sseManager.emit(taskId, 'pm_decision', {
        decision: `调用 ${toolName}`,
        reason: JSON.stringify(safeArgs),
      });
      // Fire-and-forget observability log
      logDecision({ taskId, actor: 'pm', action: toolName, input: args }).catch(() => {});
      // Fire-and-forget evidence recording for PM tool call decisions
      recordEvidence({
        taskId,
        type: 'decision',
        title: `PM调用 ${toolName}`,
        content: { toolName, args: safeArgs },
        source: 'pm',
      }).catch(err => console.error('Failed to record PM decision evidence:', err));
    },
    onToolResult: (id, toolName, result, isError) => {
      const startTime = pmToolStartTimes.get(id);
      const durationMs = startTime ? Date.now() - startTime : undefined;
      pmToolStartTimes.delete(id);
      // Fire-and-forget observability log
      logDecision({ taskId, actor: 'pm', action: toolName + '_result', output: typeof result === 'string' ? result.slice(0, 2000) : result }).catch(() => {});
    },
    onStepFinish: (info) => {
      if (info?.usage) {
        recordTokenUsage({
          taskId,
          employeeId: pm.id,
          modelId: pmModel.id,
          inputTokens: info.usage.inputTokens ?? 0,
          outputTokens: info.usage.outputTokens ?? 0,
        }).catch(err => console.error('Failed to record PM token usage:', err));
      }
    },
    onError: (error) => {
      console.error(`PM execution error for task ${taskId}:`, error.message);
    },
    onFinish: async (info) => {
      if (taskFinalized) return;

      try {
        // If PM finished without calling complete_task, auto-complete or fail
        const [currentTask] = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, taskId));
        if (currentTask?.status === 'executing') {
          const allSubs = await db.select({ id: subtasks.id, status: subtasks.status }).from(subtasks)
            .where(eq(subtasks.taskId, taskId));
          const notDone = allSubs.filter(s => s.status !== 'completed' && s.status !== 'failed');
          const failed = allSubs.filter(s => s.status === 'failed');

          if (notDone.length === 0) {
            const summary = failed.length > 0
              ? (info.text || '任务已完成（部分子任务失败）')
              : (info.text || '任务已完成');
            await completeTask(taskId, summary, '');
          } else {
            await failTask(taskId, 'PM未完成所有子任务就结束了对话');
          }
        }
        taskFinalized = true; // Only set after success
      } catch (err) {
        console.error(`onFinish DB error for task ${taskId}:`, err);
        // Don't set taskFinalized -- let the catch block handle it
      }
    },
  };

  try {
    await runner.initialize();
    await runner.run('请开始执行任务计划。', callbacks);
  } catch (err) {
    if (!taskFinalized) {
      taskFinalized = true;
      const [currentTask] = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, taskId));
      if (currentTask?.status === 'executing') {
        await failTask(taskId, `PM执行异常: ${sanitizeError(err)}`);
      }
    }
  } finally {
    await runner.cleanup();
  }
}

/** Load team tool IDs for a given team */
export async function loadTeamToolIds(teamId: string): Promise<string[]> {
  const rows = await db
    .select({ toolId: teamTools.toolId })
    .from(teamTools)
    .where(eq(teamTools.teamId, teamId));
  return rows.map(r => r.toolId);
}

export async function executeSubtask(
  taskId: string,
  subtaskId: string,
  employeeId: string,
  instruction: string,
  teamToolIds: string[],
  signal: AbortSignal,
  observerContext?: { teamId: string; brief: any },
): Promise<string> {
  // Validate subtask exists and belongs to this task
  const [st] = await db.select().from(subtasks).where(and(eq(subtasks.id, subtaskId), eq(subtasks.taskId, taskId)));
  if (!st) return `[错误] 子任务 ${subtaskId} 不存在`;
  if (st.status !== 'pending' && st.status !== 'failed') {
    return `[跳过] 子任务 ${subtaskId} 状态为 ${st.status}，无需执行`;
  }

  // Check dependencies
  const deps = safeJsonParse<string[]>(st.dependsOn, []);
  if (deps.length > 0) {
    const depStatuses = await db.select({ id: subtasks.id, status: subtasks.status })
      .from(subtasks).where(inArray(subtasks.id, deps));
    const incomplete = depStatuses.filter(d => d.status !== 'completed');
    if (incomplete.length > 0) {
      return `[阻塞] 子任务 ${subtaskId} 的依赖尚未完成: ${incomplete.map(d => d.id).join(', ')}`;
    }
  }

  // Load employee
  const [emp] = await db.select().from(employees).where(eq(employees.id, employeeId));
  if (!emp || !emp.modelId) return `[错误] 员工 ${employeeId} 不存在或未配置模型`;

  const [empModel] = await db.select().from(models).where(eq(models.id, emp.modelId));
  if (!empModel) return `[错误] 员工模型不存在`;

  // Mark subtask as running
  await db.update(subtasks).set({ status: 'running', assigneeId: employeeId, updatedAt: now() })
    .where(and(eq(subtasks.id, subtaskId), eq(subtasks.taskId, taskId)));
  sseManager.emit(taskId, 'subtask_started', {
    subtaskId, title: st.title, employeeId, employeeName: emp.name,
  });
  // Fire-and-forget evidence: subtask started
  recordEvidence({
    taskId,
    subtaskId,
    type: 'input',
    title: `子任务开始: ${st.title}`,
    content: { subtaskId, employeeId, employeeName: emp.name, instruction },
    source: 'system',
  }).catch(err => console.error('Failed to record subtask start evidence:', err));

  // Load employee's tools (intersection with team tools)
  const empToolRows = await db
    .select({ id: tools.id, name: tools.name, transportType: tools.transportType, command: tools.command, args: tools.args, envVars: tools.envVars, accessLevel: tools.accessLevel })
    .from(employeeTools)
    .innerJoin(tools, eq(employeeTools.toolId, tools.id))
    .where(eq(employeeTools.employeeId, employeeId));

  // In suggest mode, only load 'read' access level tools
  const [currentTask] = await db.select({ mode: tasks.mode }).from(tasks).where(eq(tasks.id, taskId));
  const taskMode = currentTask?.mode ?? 'suggest';

  const mcpToolConfigs: MCPToolConfig[] = empToolRows
    .filter(t => teamToolIds.includes(t.id))
    .filter(t => taskMode === 'auto' || (t.accessLevel ?? 'read') === 'read')
    .map(t => ({
      id: t.id,
      name: t.name,
      transportType: (t.transportType ?? 'stdio') as 'stdio' | 'sse',
      command: t.command,
      args: safeJsonParse<string[]>(t.args, []),
      envVars: safeJsonParse<Record<string, string>>(t.envVars, {}),
    }));

  const systemPrompt = `${emp.systemPrompt}

---
当前任务上下文：
${instruction}`;

  const aiModel = createModel({
    apiKey: empModel.apiKey,
    baseURL: empModel.baseUrl,
    modelId: empModel.modelId,
  });

  const runner = new AgentRunner({
    model: aiModel as any,
    systemPrompt,
    mcpToolConfigs,
    maxSteps: 10,
  });

  // Batch text deltas to avoid flooding SSE
  let pendingText = '';
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const flushText = () => {
    if (pendingText) {
      sseManager.emit(taskId, 'subtask_progress', { subtaskId, content: pendingText });
      pendingText = '';
    }
    flushTimer = null;
  };

  const MAX_PENDING_TEXT = 4096;

  // Token tracking
  let subtaskTokens = 0;
  const subtaskTokenLimit = getNumericSetting('subtask_token_limit', 100000);

  // Duration tracking for employee tool calls
  const empToolStartTimes = new Map<string, number>();

  const empCallbacks: AgentStreamCallbacks = {
    onTextDelta: (text) => {
      pendingText += text;
      if (pendingText.length > MAX_PENDING_TEXT) {
        flushText(); // force flush if too large
      } else if (!flushTimer) {
        flushTimer = setTimeout(flushText, 100);
      }
    },
    onToolCall: (id, toolName) => {
      empToolStartTimes.set(id, Date.now());
      sseManager.emit(taskId, 'subtask_tool_call', { subtaskId, toolName });
      logToolCall({ taskId, subtaskId, employeeId, toolName, input: { toolCallId: id } }).catch(() => {});
    },
    onToolResult: (id, toolName, result, isError) => {
      const startTime = empToolStartTimes.get(id);
      const durationMs = startTime ? Date.now() - startTime : undefined;
      empToolStartTimes.delete(id);
      const preview = typeof result === 'string' ? result.slice(0, 200) : '';
      sseManager.emit(taskId, 'subtask_tool_result', { subtaskId, toolName, preview, isError });
      logToolCall({ taskId, subtaskId, employeeId, toolName, output: typeof result === 'string' ? result.slice(0, 2000) : result, isError: !!isError, durationMs }).catch(() => {});
    },
    onStepFinish: (info) => {
      if (info?.usage) {
        subtaskTokens += (info.usage.inputTokens ?? 0) + (info.usage.outputTokens ?? 0);
        recordTokenUsage({
          taskId,
          subtaskId,
          employeeId,
          modelId: empModel.id,
          inputTokens: info.usage.inputTokens ?? 0,
          outputTokens: info.usage.outputTokens ?? 0,
        }).catch(err => console.error('Failed to record token usage:', err));
      }
    },
    onError: (error) => {
      console.error(`Subtask ${subtaskId} error:`, error.message);
    },
    onFinish: () => { flushText(); },
  };

  // Execute with timeout
  let resultText = '';

  try {
    await runner.initialize();
    // Race between actual execution and timeout/abort
    const raceCleanup = new AbortController();
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`Subtask execution timeout (${SUBTASK_TIMEOUT_MS / 1000}s)`)), SUBTASK_TIMEOUT_MS);
      raceCleanup.signal.addEventListener('abort', () => clearTimeout(timer));
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('Task execution aborted'));
      }, { signal: raceCleanup.signal });
    });
    await Promise.race([
      runner.run(instruction, empCallbacks),
      timeoutPromise,
    ]).finally(() => raceCleanup.abort());
    resultText = runner.getLastAssistantText();

    // Validate output quality
    const validation = await validateSubtaskOutput(subtaskId, resultText);
    if (!validation.valid) {
      const result = await handleSubtaskFailure(taskId, subtaskId, validation.reason || '输出质量不合格', 'quality_rejected');
      if (result.action === 'retried' || result.action === 'reassigned') {
        return `[子任务输出校验失败] ${validation.reason}，${result.message}`;
      }
      if (result.action === 'escalated' || result.action === 'skipped') {
        return `[子任务输出校验失败] ${validation.reason}，${result.message}`;
      }
    }

    // Mark completed
    await db.update(subtasks).set({
      status: 'completed',
      output: JSON.stringify({ summary: resultText.slice(0, 2000) }),
      tokenUsage: subtaskTokens,
      updatedAt: now(),
    }).where(and(eq(subtasks.id, subtaskId), eq(subtasks.taskId, taskId)));

    // Accumulate token usage to task
    if (subtaskTokens > 0) {
      await db.update(tasks).set({
        tokenUsage: sql`coalesce(${tasks.tokenUsage}, 0) + ${subtaskTokens}`,
        updatedAt: now(),
      }).where(eq(tasks.id, taskId));
    }

    sseManager.emit(taskId, 'subtask_completed', {
      subtaskId, status: 'completed', output: { summary: resultText.slice(0, 500) },
    });
    // Fire-and-forget evidence: subtask completed
    recordEvidence({
      taskId,
      subtaskId,
      type: 'output',
      title: `子任务完成: ${st.title}`,
      content: { summary: resultText.slice(0, 2000), tokenUsage: subtaskTokens },
      source: 'employee',
    }).catch(err => console.error('Failed to record subtask completion evidence:', err));

    // Run observer check asynchronously (fire and forget)
    if (observerContext?.teamId) {
      runObserverCheck(taskId, observerContext.teamId, subtaskId, st.title, resultText, observerContext.brief).catch(err => {
        console.error('Observer check failed:', err);
      });
    }

    return resultText || '子任务已完成（无文本输出）';
  } catch (err) {
    const errorMsg = sanitizeError(err);
    const isTimeout = errorMsg.includes('timeout') || errorMsg.includes('aborted');

    // Use error protection for retry/reassign logic
    const errorType = isTimeout ? 'timeout' : 'execution_error';
    const protectionResult = await handleSubtaskFailure(taskId, subtaskId, errorMsg, errorType);
    if (protectionResult.action === 'retried' || protectionResult.action === 'reassigned') {
      if (subtaskTokens > 0) {
        await db.update(tasks).set({
          tokenUsage: sql`coalesce(${tasks.tokenUsage}, 0) + ${subtaskTokens}`,
          updatedAt: now(),
        }).where(eq(tasks.id, taskId));
      }
      return `[子任务执行失败] ${errorMsg}，${protectionResult.message}`;
    }

    // Escalated: mark as failed (existing behavior)
    await db.update(subtasks).set({
      status: 'failed',
      output: JSON.stringify({ error: isTimeout ? `执行超时（${SUBTASK_TIMEOUT_MS / 1000}s）` : errorMsg }),
      tokenUsage: subtaskTokens,
      updatedAt: now(),
    }).where(and(eq(subtasks.id, subtaskId), eq(subtasks.taskId, taskId)));

    if (subtaskTokens > 0) {
      await db.update(tasks).set({
        tokenUsage: sql`coalesce(${tasks.tokenUsage}, 0) + ${subtaskTokens}`,
        updatedAt: now(),
      }).where(eq(tasks.id, taskId));
    }

    sseManager.emit(taskId, 'subtask_failed', {
      subtaskId, error: isTimeout ? `执行超时（${SUBTASK_TIMEOUT_MS / 1000}s）` : errorMsg,
    });

    return `[子任务执行失败] ${errorMsg}`;
  } finally {
    if (flushTimer) clearTimeout(flushTimer);
    await runner.cleanup();
  }
}

async function pauseTask(taskId: string, reason: string): Promise<void> {
  const updated = db.update(tasks)
    .set({ status: 'paused', updatedAt: now() })
    .where(and(eq(tasks.id, taskId), eq(tasks.status, 'executing')))
    .run();

  if (updated.changes > 0) {
    // Pause running subtasks
    db.update(subtasks)
      .set({ status: 'paused', updatedAt: now() })
      .where(and(eq(subtasks.taskId, taskId), eq(subtasks.status, 'running')))
      .run();

    sseManager.emit(taskId, 'task_status', { taskId, status: 'paused', previousStatus: 'executing', reason });

    // Abort the execution
    const ac = activeExecutions.get(taskId);
    if (ac) ac.abort();
  }
}

export async function completeTask(taskId: string, summary: string, deliverables: string): Promise<void> {
  const { updated, result } = db.transaction((tx) => {
    const taskSubs = tx.select({ status: subtasks.status }).from(subtasks).where(eq(subtasks.taskId, taskId)).all();
    const total = taskSubs.length;
    const completed = taskSubs.filter(s => s.status === 'completed').length;
    const failed = taskSubs.filter(s => s.status === 'failed').length;

    const result = {
      summary,
      deliverables,
      subtaskSummary: { total, completed, failed },
      completedAt: new Date().toISOString(),
    };

    const dbResult = tx.update(tasks).set({
      status: 'completed',
      result: JSON.stringify(result),
      updatedAt: now(),
    }).where(and(eq(tasks.id, taskId), inArray(tasks.status, ['executing', 'paused']))).run();

    return { updated: dbResult.changes > 0, result };
  });

  if (updated) {
    sseManager.emit(taskId, 'task_completed', { taskId, result });
    sseManager.emit(taskId, 'task_status', { taskId, status: 'completed', previousStatus: 'executing' });
  }
}

export async function failTask(taskId: string, error: string): Promise<void> {
  const updated = db.transaction((tx) => {
    const taskSubs = tx.select({ status: subtasks.status }).from(subtasks).where(eq(subtasks.taskId, taskId)).all();
    const total = taskSubs.length;
    const completed = taskSubs.filter(s => s.status === 'completed').length;
    const failed = taskSubs.filter(s => s.status === 'failed').length;

    const result = {
      summary: `任务执行失败：${error}`,
      error,
      subtaskSummary: { total, completed, failed },
      failedAt: new Date().toISOString(),
    };

    const dbResult = tx.update(tasks).set({
      status: 'failed',
      result: JSON.stringify(result),
      updatedAt: now(),
    }).where(and(eq(tasks.id, taskId), inArray(tasks.status, ['executing', 'paused']))).run();

    return dbResult.changes > 0;
  });

  if (updated) {
    sseManager.emit(taskId, 'task_status', { taskId, status: 'failed', previousStatus: 'executing' });
  }
}
