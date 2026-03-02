import { db, tasks, taskMessages, subtasks, teams, employees, models, teamMembers, tools, teamTools, tokenUsageLogs, decisionLogs, toolCallLogs, observerFindings, errorTraces, evidenceItems, notifications, generateId, now } from '@agentcorp/db';
import { eq, and, desc, inArray, ne } from 'drizzle-orm';
import { AppError } from '../errors.js';
import { AgentRunner, createModel } from '@agentcorp/agent-core';
import type { AgentStreamCallbacks } from '@agentcorp/agent-core';
import { startTaskExecution } from './task-executor.js';
import { assertNotFrozen, getSetting } from './system.js';
import { estimateTaskCost } from './cost-tracker.js';
import { applyTemplate } from './templates.js';
import { recordEvidence } from './evidence.js';
import { tool, jsonSchema } from 'ai';
import type { ToolSet } from 'ai';

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw); }
  catch { return fallback; }
}

// ---- State machine ----

const BRIEF_FIELDS = ['title', 'objective', 'deliverables', 'constraints', 'acceptanceCriteria'];
const VALID_CHAT_STATES = ['draft', 'aligning'];

const STATE_ORDER = ['draft', 'aligning', 'brief_review', 'team_review', 'plan_review', 'executing', 'completed', 'failed'];

function isStatePast(current: string | null, required: string): boolean {
  const ci = STATE_ORDER.indexOf(current ?? '');
  const ri = STATE_ORDER.indexOf(required);
  return ci > ri;
}

function assertState(task: { status: string | null }, requiredStatus: string, action: string) {
  if (task.status !== requiredStatus) {
    throw new AppError('INVALID_STATE', `当前状态 ${task.status} 不允许执行 ${action} 操作`, {
      currentStatus: task.status ?? 'unknown',
      requiredStatus,
    });
  }
}

/** Conditional UPDATE with status guard. Returns true if the row was updated. */
function conditionalStatusUpdate(taskId: string, requiredStatus: string, updates: Record<string, unknown>): boolean {
  const result = db.update(tasks)
    .set(updates)
    .where(and(eq(tasks.id, taskId), eq(tasks.status, requiredStatus)))
    .run();
  return result.changes > 0;
}

// ---- List ----

export async function listTasks(teamId?: string, status?: string) {
  const conditions = [];
  if (teamId) conditions.push(eq(tasks.teamId, teamId));
  if (status) conditions.push(eq(tasks.status, status));

  let query = db
    .select({
      id: tasks.id,
      teamId: tasks.teamId,
      teamName: teams.name,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      mode: tasks.mode,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .leftJoin(teams, eq(tasks.teamId, teams.id))
    .orderBy(desc(tasks.createdAt))
    .$dynamic();

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const rows = await query;
  return rows.map(r => ({
    ...r,
    teamName: r.teamName ?? '',
  }));
}

// ---- Detail ----

export async function getTask(id: string) {
  const [task] = await db
    .select({
      id: tasks.id,
      teamId: tasks.teamId,
      teamName: teams.name,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      mode: tasks.mode,
      brief: tasks.brief,
      teamConfig: tasks.teamConfig,
      plan: tasks.plan,
      result: tasks.result,
      tokenUsage: tasks.tokenUsage,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .leftJoin(teams, eq(tasks.teamId, teams.id))
    .where(eq(tasks.id, id));

  if (!task) throw new AppError('NOT_FOUND', `任务 ${id} 不存在`);

  const subs = await db
    .select({
      id: subtasks.id,
      title: subtasks.title,
      description: subtasks.description,
      assigneeId: subtasks.assigneeId,
      assigneeName: employees.name,
      status: subtasks.status,
      dependsOn: subtasks.dependsOn,
      output: subtasks.output,
      sortOrder: subtasks.sortOrder,
      tokenUsage: subtasks.tokenUsage,
      createdAt: subtasks.createdAt,
      updatedAt: subtasks.updatedAt,
    })
    .from(subtasks)
    .leftJoin(employees, eq(subtasks.assigneeId, employees.id))
    .where(eq(subtasks.taskId, id))
    .orderBy(subtasks.sortOrder);

  return {
    ...task,
    teamName: task.teamName ?? '',
    brief: safeJsonParse(task.brief, null),
    teamConfig: safeJsonParse(task.teamConfig, null),
    plan: safeJsonParse(task.plan, null),
    result: safeJsonParse(task.result, null),
    subtasks: subs.map(s => ({
      ...s,
      assigneeName: s.assigneeName ?? '',
      dependsOn: safeJsonParse(s.dependsOn, []),
      output: safeJsonParse(s.output, null),
    })),
  };
}

// ---- Create ----

async function createAdHocTeam(pmEmployeeId: string): Promise<string> {
  const [pm] = await db.select().from(employees).where(eq(employees.id, pmEmployeeId));
  if (!pm) throw new AppError('NOT_FOUND', `PM员工 ${pmEmployeeId} 不存在`);

  const otherEmployees = await db.select({ id: employees.id }).from(employees).where(ne(employees.id, pmEmployeeId));
  const allTools = await db.select({ id: tools.id }).from(tools);

  const teamId = generateId();
  const timestamp = now();

  db.transaction((tx) => {
    tx.insert(teams).values({
      id: teamId,
      name: `快速团队-${pm.name}`,
      description: '自动创建的临时团队',
      pmEmployeeId,
      collaborationMode: 'sequential',
      createdAt: timestamp,
      updatedAt: timestamp,
    }).run();

    // Add PM as member
    tx.insert(teamMembers).values({ teamId, employeeId: pmEmployeeId, role: 'pm' }).run();
    // Add all other employees
    for (const emp of otherEmployees) {
      tx.insert(teamMembers).values({ teamId, employeeId: emp.id, role: 'member' }).run();
    }
    // Add all tools
    for (const t of allTools) {
      tx.insert(teamTools).values({ teamId, toolId: t.id }).run();
    }
  });

  return teamId;
}

export async function createTask(input: { teamId?: string; pmEmployeeId?: string; description: string; mode?: string; title?: string }) {
  assertNotFrozen();

  let teamId = input.teamId;
  if (!teamId && input.pmEmployeeId) {
    teamId = await createAdHocTeam(input.pmEmployeeId);
  }
  if (!teamId) throw new AppError('VALIDATION_ERROR', 'teamId 或 pmEmployeeId 必须提供其一');

  const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId));
  if (!team) throw new AppError('NOT_FOUND', `团队 ${teamId} 不存在`);

  const id = generateId();
  const timestamp = now();
  await db.insert(tasks).values({
    id,
    teamId,
    title: input.title ?? null,
    description: input.description,
    status: 'draft',
    mode: input.mode ?? 'suggest',
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  return getTask(id);
}

// ---- Quick Create (template-based) ----

export async function quickCreateTask(input: {
  templateId: string;
  modelId: string;
  description: string;
  mode?: string;
  title?: string;
  teamName?: string;
}) {
  assertNotFrozen();
  const { teamId } = await applyTemplate(input.templateId, input.modelId);

  if (input.teamName) {
    await db.update(teams).set({ name: input.teamName }).where(eq(teams.id, teamId));
  }

  return createTask({
    teamId,
    description: input.description,
    mode: input.mode,
    title: input.title,
  });
}

// ---- Auto Start ----

export async function autoStartTask(taskId: string) {
  assertNotFrozen();
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new AppError('NOT_FOUND', `任务 ${taskId} 不存在`);

  if (task.status === 'executing') return;
  if (task.status !== 'draft') {
    throw new AppError('INVALID_STATE', `任务状态为 ${task.status}，无法直接启动`);
  }

  if (!task.teamId) throw new AppError('VALIDATION_ERROR', '任务未关联团队');
  const [team] = await db.select({ pmEmployeeId: teams.pmEmployeeId }).from(teams).where(eq(teams.id, task.teamId));
  if (!team?.pmEmployeeId) throw new AppError('VALIDATION_ERROR', '团队未配置PM');

  const [pmEmp] = await db.select({ id: employees.id, name: employees.name }).from(employees).where(eq(employees.id, team.pmEmployeeId));
  if (!pmEmp) throw new AppError('NOT_FOUND', 'PM员工不存在');

  // Build/normalize teamConfig (auto-start bypasses approval workflow, so we must self-heal here)
  const memberRows = await db
    .select({ id: employees.id, name: employees.name, description: employees.description })
    .from(teamMembers)
    .innerJoin(employees, eq(teamMembers.employeeId, employees.id))
    .where(and(eq(teamMembers.teamId, task.teamId), ne(teamMembers.employeeId, team.pmEmployeeId)));

  const existingTeamConfig = safeJsonParse<any>(task.teamConfig, null);
  const existingMembers = Array.isArray(existingTeamConfig?.members) ? existingTeamConfig.members : [];
  const fallbackMembers = memberRows.map(m => ({ id: m.id, name: m.name, taskPrompt: m.description || '' }));
  const mergedMembers = existingMembers.length > 0 ? existingMembers : fallbackMembers;
  const normalizedMembers = mergedMembers.length > 0
    ? mergedMembers
    : [{ id: pmEmp.id, name: pmEmp.name, taskPrompt: '当团队成员为空时，暂由PM兼任执行。' }];
  const teamConfig = {
    pm: { id: pmEmp.id, name: pmEmp.name },
    members: normalizedMembers,
  };

  await db.update(tasks).set({ teamConfig: JSON.stringify(teamConfig), updatedAt: now() }).where(eq(tasks.id, taskId));

  // Ensure there is at least one subtask, otherwise execution will immediately fail with "没有子任务可执行".
  const existingSubs = db.select({ id: subtasks.id }).from(subtasks).where(eq(subtasks.taskId, taskId)).all();
  if (existingSubs.length === 0) {
    const parsedPlan = safeJsonParse<{ subtasks?: any[] }>(task.plan, { subtasks: [] });
    let validSubtasks = (parsedPlan.subtasks ?? [])
      .filter((st: any) => st && typeof st.title === 'string' && st.title.length > 0);

    if (validSubtasks.length === 0) {
      validSubtasks = [{
        id: 'sub_autostart_bootstrap',
        title: task.title || '自动启动默认执行子任务',
        description: task.description || '请基于任务描述完成交付物并输出总结。',
        assigneeId: teamConfig.members[0]?.id ?? pmEmp.id,
        dependsOn: [],
      }];
    }

    const timestamp = now();
    db.transaction((tx) => {
      const idMap = new Map<string, string>();
      const seenIds = new Set<string>();
      for (const st of validSubtasks) {
        let baseId = st.id || `_auto_${idMap.size}`;
        while (seenIds.has(baseId)) baseId += '_dup';
        seenIds.add(baseId);
        st.id = baseId;
        idMap.set(baseId, generateId());
      }

      for (let i = 0; i < validSubtasks.length; i++) {
        const st = validSubtasks[i];
        const realId = idMap.get(st.id)!;
        const rawDeps = Array.isArray(st.dependsOn) ? st.dependsOn : [];
        const remappedDeps = rawDeps.map((dep: string) => idMap.get(dep)).filter(Boolean);
        tx.insert(subtasks).values({
          id: realId,
          taskId,
          title: st.title,
          description: st.description || null,
          assigneeId: st.assigneeId || null,
          status: 'pending',
          dependsOn: remappedDeps.length > 0 ? JSON.stringify(remappedDeps) : null,
          sortOrder: i,
          createdAt: timestamp,
          updatedAt: timestamp,
        }).run();
      }

      if (!task.plan) {
        tx.update(tasks).set({
          plan: JSON.stringify({ subtasks: validSubtasks }),
          updatedAt: timestamp,
        }).where(eq(tasks.id, taskId)).run();
      }
    });
  }

  // Atomic conditional update to prevent duplicate execution
  const result = db.update(tasks)
    .set({ status: 'executing', updatedAt: now() })
    .where(and(eq(tasks.id, taskId), eq(tasks.status, 'draft')))
    .run();
  if (result.changes === 0) return; // Already changed by another request
  startTaskExecution(taskId);
}

// ---- Delete ----

export async function deleteTask(id: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!task) throw new AppError('NOT_FOUND', `任务 ${id} 不存在`);

  // Use transaction with status guard to prevent TOCTOU race
  // Delete order: child tables referencing subtasks → subtasks → taskMessages → tasks
  const deleted = db.transaction((tx) => {
    // Guard: cannot delete executing tasks
    const [current] = tx.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, id)).all();
    if (current?.status === 'executing') return false;

    // 1. Delete tables that reference subtasks.id (no cascade) + notifications
    tx.delete(tokenUsageLogs).where(eq(tokenUsageLogs.taskId, id)).run();
    tx.delete(decisionLogs).where(eq(decisionLogs.taskId, id)).run();
    tx.delete(toolCallLogs).where(eq(toolCallLogs.taskId, id)).run();
    tx.delete(observerFindings).where(eq(observerFindings.taskId, id)).run();
    tx.delete(errorTraces).where(eq(errorTraces.taskId, id)).run();
    tx.delete(evidenceItems).where(eq(evidenceItems.taskId, id)).run();
    tx.delete(notifications).where(eq(notifications.taskId, id)).run();
    // 2. Delete subtasks and messages
    tx.delete(subtasks).where(eq(subtasks.taskId, id)).run();
    tx.delete(taskMessages).where(eq(taskMessages.taskId, id)).run();
    // 3. Delete the task itself
    tx.delete(tasks).where(eq(tasks.id, id)).run();
    return true;
  });

  if (!deleted) throw new AppError('CONFLICT', '执行中的任务无法删除');
  return { id };
}

// ---- Messages ----

export async function getTaskMessages(taskId: string, type?: string) {
  const [task] = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new AppError('NOT_FOUND', `任务 ${taskId} 不存在`);

  const conditions = [eq(taskMessages.taskId, taskId)];
  if (type) conditions.push(eq(taskMessages.messageType, type));

  return db
    .select()
    .from(taskMessages)
    .where(and(...conditions))
    .orderBy(taskMessages.createdAt);
}

// ---- Chat with PM (SSE) ----

const activeTaskChatLocks = new Set<string>();

// Callback extension for status change events
export interface TaskChatCallbacks extends AgentStreamCallbacks {
  onStatusChange?: (status: string, data: unknown) => void;
}

export async function runTaskChat(
  taskId: string,
  message: string,
  callbacks: TaskChatCallbacks,
) {
  if (activeTaskChatLocks.has(taskId)) {
    throw new AppError('VALIDATION_ERROR', '该任务正在对话中，请稍后再试');
  }
  activeTaskChatLocks.add(taskId);

  let runner: AgentRunner | null = null;
  // Flag: generate_brief was called during this stream
  let pendingBrief: Record<string, string> | null = null;

  try {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!task) throw new AppError('NOT_FOUND', `任务 ${taskId} 不存在`);

    if (!VALID_CHAT_STATES.includes(task.status ?? '')) {
      throw new AppError('INVALID_STATE', `当前状态 ${task.status} 不允许对话`, {
        currentStatus: task.status ?? 'unknown',
        requiredStatus: 'draft 或 aligning',
      });
    }

    if (task.status === 'draft') {
      const ok = conditionalStatusUpdate(taskId, 'draft', { status: 'aligning', updatedAt: now() });
      if (!ok) {
        const [fresh] = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, taskId));
        if (!fresh || !VALID_CHAT_STATES.includes(fresh.status ?? '')) {
          throw new AppError('CONFLICT', '任务状态已变更，请刷新后重试');
        }
      }
    }

    // Validate team still exists
    if (!task.teamId) throw new AppError('VALIDATION_ERROR', '任务未关联团队');
    const [team] = await db.select().from(teams).where(eq(teams.id, task.teamId));
    if (!team || !team.pmEmployeeId) throw new AppError('VALIDATION_ERROR', '团队未配置PM');

    const [pm] = await db.select().from(employees).where(eq(employees.id, team.pmEmployeeId));
    if (!pm) throw new AppError('NOT_FOUND', 'PM员工不存在');
    if (!pm.modelId) throw new AppError('VALIDATION_ERROR', 'PM未配置模型');

    const [model] = await db.select().from(models).where(eq(models.id, pm.modelId));
    if (!model) throw new AppError('NOT_FOUND', `模型 ${pm.modelId} 不存在`);

    const timestamp = now();

    // Save user message
    await db.insert(taskMessages).values({
      id: generateId(),
      taskId,
      role: 'user',
      content: message,
      messageType: 'chat',
      createdAt: timestamp,
    });

    // Pre-insert assistant placeholder
    const assistantMsgId = generateId();
    await db.insert(taskMessages).values({
      id: assistantMsgId,
      taskId,
      role: 'assistant',
      senderId: pm.id,
      content: '',
      messageType: 'chat',
      createdAt: timestamp,
    });

    // Load chat history
    const history = await db
      .select()
      .from(taskMessages)
      .where(and(eq(taskMessages.taskId, taskId), eq(taskMessages.messageType, 'chat')))
      .orderBy(taskMessages.createdAt);

    const modelMessages = history
      .filter(m => m.id !== assistantMsgId && m.content)
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: [{ type: 'text' as const, text: m.content }],
      }));

    // PM internal tools — generate_brief sets a flag, actual DB transition happens in onFinish
    const pmTools: ToolSet = {
      generate_brief: tool<unknown, string>({
        description: '当需求已充分对齐时，生成结构化任务书。只有在用户明确表示需求已清晰或你认为信息已足够时才调用。',
        inputSchema: jsonSchema({
          type: 'object' as const,
          properties: {
            title: { type: 'string', description: '任务标题' },
            objective: { type: 'string', description: '任务目标' },
            deliverables: { type: 'string', description: '交付物定义' },
            constraints: { type: 'string', description: '约束条件' },
            acceptanceCriteria: { type: 'string', description: '验收标准' },
          },
          required: ['title', 'objective', 'deliverables', 'acceptanceCriteria'],
        }),
        execute: async (args) => {
          pendingBrief = args as Record<string, string>;
          return '任务书已生成，等待用户审批。';
        },
      }),
    };

    const isAutoMode = task.mode === 'auto';
    const alignmentPrompt = `${pm.systemPrompt}

你现在是项目经理，正在与用户对齐任务需求。

任务描述：${task.description}

你的职责：
1. 理解用户的需求，通过提问澄清模糊点
2. 当需求足够清晰时，调用 generate_brief 工具生成结构化任务书
3. 任务书应包含：标题、目标、交付物、约束条件、验收标准
${isAutoMode
  ? `4. 当前是自动执行模式。如果任务描述已经足够明确（包含目标、范围等关键信息），请直接调用 generate_brief 生成任务书，不要反复提问。用户说"开始"或"执行"等指令时，立即生成任务书。`
  : `4. 不要过早生成任务书，确保关键信息已确认`}

请用中文与用户交流。`;

    const aiModel = createModel({
      apiKey: model.apiKey,
      baseURL: model.baseUrl,
      modelId: model.modelId,
    });

    runner = new AgentRunner({
      model: aiModel as any,
      systemPrompt: alignmentPrompt,
      mcpToolConfigs: [],
      internalTools: pmTools,
      maxSteps: 5,
      assistantMessageId: assistantMsgId,
    });

    const toolCallsAccum: unknown[] = [];
    const wrappedCallbacks: AgentStreamCallbacks = {
      onTextDelta: callbacks.onTextDelta,
      onToolCall: (id, toolName, args) => {
        toolCallsAccum.push({ id, toolName, args });
        callbacks.onToolCall(id, toolName, args);
      },
      onToolResult: callbacks.onToolResult,
      onStepFinish: callbacks.onStepFinish,
      onError: callbacks.onError,
      onFinish: async (info) => {
        try {
          // Persist assistant message
          await db.update(taskMessages).set({
            content: info.text,
            metadata: toolCallsAccum.length > 0 ? JSON.stringify(toolCallsAccum) : null,
          }).where(eq(taskMessages.id, assistantMsgId));

          // Apply deferred brief transition only on successful completion
          if (pendingBrief && info.finishReason !== 'error') {
            const updated = conditionalStatusUpdate(taskId, 'aligning', {
              title: pendingBrief.title,
              brief: JSON.stringify(pendingBrief),
              status: 'brief_review',
              updatedAt: now(),
            });
            if (updated) {
              callbacks.onStatusChange?.('brief_review', { brief: pendingBrief });

              // Auto mode: auto-approve brief (triggers chain: brief → team → plan → execute)
              const [currentTask] = await db.select({ mode: tasks.mode }).from(tasks).where(eq(tasks.id, taskId));
              if (currentTask?.mode === 'auto') {
                // Run in background to not block the SSE response
                setTimeout(async () => {
                  try {
                    await approveBrief(taskId, { approved: true });
                  } catch (err) {
                    console.error('Auto approve brief failed:', err);
                  }
                }, 500);
              }
            }
          }
        } catch (err) {
          console.error('Failed to persist task chat result:', assistantMsgId, err);
        }
        try {
          callbacks.onFinish(info);
        } catch {}
      },
    };

    await runner.initialize();
    // Load history minus the last user message (run() adds it)
    runner.loadMessages(modelMessages.slice(0, -1));
    await runner.run(message, wrappedCallbacks);
  } finally {
    activeTaskChatLocks.delete(taskId);
    if (runner) await runner.cleanup();
  }
}

// ---- Approve Brief ----

export async function approveBrief(taskId: string, input: { approved: boolean; modifications?: Record<string, string> }) {
  assertNotFrozen();
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new AppError('NOT_FOUND', `任务 ${taskId} 不存在`);
  if (isStatePast(task.status, 'brief_review')) return getTask(taskId);
  assertState(task, 'brief_review', 'approve-brief');

  if (!input.approved) {
    const brief = safeJsonParse<Record<string, string>>(task.brief, {});
    if (input.modifications) {
      for (const key of BRIEF_FIELDS) {
        if (key in input.modifications && typeof input.modifications[key] === 'string') {
          brief[key] = input.modifications[key];
        }
      }
    }
    const ok = conditionalStatusUpdate(taskId, 'brief_review', {
      brief: JSON.stringify(brief),
      status: 'aligning',
      updatedAt: now(),
    });
    if (!ok) throw new AppError('CONFLICT', '任务状态已变更，请刷新后重试');
    return getTask(taskId);
  }

  // Validate team still exists
  if (!task.teamId) throw new AppError('VALIDATION_ERROR', '任务未关联团队');

  const teamConfig = await pmRecommendTeam(task);
  const ok = conditionalStatusUpdate(taskId, 'brief_review', {
    teamConfig: JSON.stringify(teamConfig),
    status: 'team_review',
    updatedAt: now(),
  });
  if (!ok) throw new AppError('CONFLICT', '任务状态已变更，请刷新后重试');

  // Auto mode: chain to team approval
  if (task.mode === 'auto') {
    try {
      return await approveTeam(taskId, { approved: true });
    } catch (err) {
      console.error('Auto approve team failed:', err);
      // Fall through to manual review
    }
  }

  return getTask(taskId);
}

// ---- Approve Team ----

export async function approveTeam(taskId: string, input: { approved: boolean; adjustments?: { addMembers?: string[]; removeMembers?: string[] } }) {
  assertNotFrozen();
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new AppError('NOT_FOUND', `任务 ${taskId} 不存在`);
  if (isStatePast(task.status, 'team_review')) return getTask(taskId);
  assertState(task, 'team_review', 'approve-team');

  if (!input.approved) {
    const teamConfig = safeJsonParse<any>(task.teamConfig, { pm: null, members: [] });
    if (input.adjustments?.removeMembers) {
      teamConfig.members = teamConfig.members.filter((m: any) => !input.adjustments!.removeMembers!.includes(m.id));
    }
    if (input.adjustments?.addMembers?.length) {
      // Only allow adding employees that belong to the task's team
      const validMembers = await db.select({ employeeId: teamMembers.employeeId })
        .from(teamMembers).where(eq(teamMembers.teamId, task.teamId!));
      const validIds = new Set(validMembers.map(m => m.employeeId));
      const filtered = input.adjustments.addMembers.filter(id => validIds.has(id));
      if (filtered.length > 0) {
        const newEmps = await db.select({ id: employees.id, name: employees.name }).from(employees)
          .where(inArray(employees.id, filtered));
        for (const emp of newEmps) {
          teamConfig.members.push({ id: emp.id, name: emp.name, taskPrompt: '' });
        }
      }
    }
    const ok = conditionalStatusUpdate(taskId, 'team_review', {
      teamConfig: JSON.stringify(teamConfig),
      status: 'aligning',
      updatedAt: now(),
    });
    if (!ok) throw new AppError('CONFLICT', '任务状态已变更，请刷新后重试');
    return getTask(taskId);
  }

  if (!task.teamId) throw new AppError('VALIDATION_ERROR', '任务未关联团队');

  const plan = await pmGeneratePlan(task);
  const ok = conditionalStatusUpdate(taskId, 'team_review', {
    plan: JSON.stringify(plan),
    status: 'plan_review',
    updatedAt: now(),
  });
  if (!ok) throw new AppError('CONFLICT', '任务状态已变更，请刷新后重试');

  // Fire-and-forget evidence: PM generated plan
  recordEvidence({
    taskId,
    type: 'decision',
    title: 'PM生成执行计划',
    content: { subtaskCount: plan.subtasks?.length ?? 0, plan },
    source: 'pm',
  }).catch(err => console.error('Failed to record plan evidence:', err));

  // Auto mode: chain to plan approval
  if (task.mode === 'auto') {
    try {
      return await approvePlan(taskId, { approved: true });
    } catch (err) {
      console.error('Auto approve plan failed:', err);
      // Fall through to manual review
    }
  }

  return getTask(taskId);
}

// ---- Approve Plan ----

export async function approvePlan(taskId: string, input: { approved: boolean; feedback?: string }) {
  assertNotFrozen();
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new AppError('NOT_FOUND', `任务 ${taskId} 不存在`);
  if (isStatePast(task.status, 'plan_review')) return getTask(taskId);
  assertState(task, 'plan_review', 'approve-plan');

  if (!input.approved) {
    const ok = conditionalStatusUpdate(taskId, 'plan_review', {
      status: 'team_review',
      updatedAt: now(),
    });
    if (!ok) throw new AppError('CONFLICT', '任务状态已变更，请刷新后重试');
    return getTask(taskId);
  }

  const plan = safeJsonParse<{ subtasks: any[] }>(task.plan, { subtasks: [] });
  const timestamp = now();

  // Validate and insert subtasks with ID remapping
  const validSubtasks = plan.subtasks.filter((st: any) => st && typeof st.title === 'string' && st.title.length > 0);
  if (validSubtasks.length === 0) {
    const teamConfig = safeJsonParse<any>(task.teamConfig, { members: [] });
    const fallbackAssigneeId = teamConfig.members?.[0]?.id || null;
    validSubtasks.push({
      id: 'sub_fallback_autofix',
      title: task.title || '自动补全执行子任务',
      description: task.description || '请基于任务描述完成交付物并输出总结。',
      assigneeId: fallbackAssigneeId,
      dependsOn: [],
    });
  }

  db.transaction((tx) => {
    // Build ID mapping: LLM-generated id -> real DB id (deduplicate)
    const idMap = new Map<string, string>();
    const seenIds = new Set<string>();
    for (const st of validSubtasks) {
      let baseId = st.id || `_unmapped_${idMap.size}`;
      while (seenIds.has(baseId)) baseId += '_dup';
      seenIds.add(baseId);
      st.id = baseId;
      idMap.set(baseId, generateId());
    }

    for (let i = 0; i < validSubtasks.length; i++) {
      const st = validSubtasks[i];
      const realId = idMap.get(st.id)!;
      // Remap dependsOn to use real DB IDs
      const rawDeps = Array.isArray(st.dependsOn) ? st.dependsOn : [];
      const remappedDeps = rawDeps.map((dep: string) => idMap.get(dep)).filter(Boolean);

      tx.insert(subtasks).values({
        id: realId,
        taskId,
        title: st.title,
        description: st.description || null,
        assigneeId: st.assigneeId || null,
        status: 'pending',
        dependsOn: remappedDeps.length > 0 ? JSON.stringify(remappedDeps) : null,
        sortOrder: i,
        createdAt: timestamp,
        updatedAt: timestamp,
      }).run();
    }

    const result = tx.update(tasks)
      .set({ status: 'executing', updatedAt: timestamp })
      .where(and(eq(tasks.id, taskId), eq(tasks.status, 'plan_review')))
      .run();

    if (result.changes === 0) {
      throw new AppError('CONFLICT', '任务状态已变更，请刷新后重试');
    }
  });

  // Estimate cost based on subtask count and model pricing
  estimateTaskCost(taskId).catch(err => {
    console.error('Failed to estimate task cost:', err);
  });

  // Fire-and-forget evidence: plan approved
  recordEvidence({
    taskId,
    type: 'approval',
    title: '用户批准执行计划',
    content: { approved: true },
    source: 'system',
  }).catch(err => console.error('Failed to record plan approval evidence:', err));

  // Trigger background execution
  startTaskExecution(taskId).catch(err => {
    console.error(`Failed to start execution for task ${taskId}:`, err);
  });

  return getTask(taskId);
}

// ---- PM LLM helpers ----

async function loadPMModel(teamId: string | null) {
  if (!teamId) throw new AppError('VALIDATION_ERROR', '任务未关联团队');

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) throw new AppError('NOT_FOUND', '关联的团队已被删除');
  if (!team.pmEmployeeId) throw new AppError('VALIDATION_ERROR', '团队未配置PM');

  const [pm] = await db.select().from(employees).where(eq(employees.id, team.pmEmployeeId));
  if (!pm) throw new AppError('VALIDATION_ERROR', 'PM员工不存在');
  const pmModelId = pm.modelId || getSetting('default_model_id');
  if (!pmModelId) throw new AppError('VALIDATION_ERROR', 'PM未配置模型且未设置默认模型');

  const [model] = await db.select().from(models).where(eq(models.id, pmModelId));
  if (!model) throw new AppError('NOT_FOUND', '模型不存在');

  const members = await db
    .select({ id: employees.id, name: employees.name, description: employees.description, systemPrompt: employees.systemPrompt })
    .from(teamMembers)
    .innerJoin(employees, eq(teamMembers.employeeId, employees.id))
    .where(eq(teamMembers.teamId, teamId));

  return { team, pm, model, members };
}

async function callLLMWithRetry(aiModel: any, prompt: string, maxRetries = 1, timeoutMs = 120000): Promise<any> {
  const { generateText } = await import('ai');
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await generateText({
        model: aiModel,
        prompt: attempt > 0 ? prompt + '\n\n注意：请严格只返回JSON格式，不要包含任何其他文字。' : prompt,
        abortSignal: AbortSignal.timeout(timeoutMs),
      });

      const text = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      // Try direct parse first, then extract JSON object from text
      try {
        return JSON.parse(text);
      } catch {
        const jsonMatch = text.match(/\{[\s\S]*?\}(?=[^}]*$)/);
        if (!jsonMatch) throw new Error('No JSON object found in LLM response');
        // Try the match; if it fails, try the greedy match as fallback
        try {
          return JSON.parse(jsonMatch[0]);
        } catch {
          const greedyMatch = text.match(/\{[\s\S]*\}/);
          if (!greedyMatch) throw new Error('No valid JSON object in LLM response');
          return JSON.parse(greedyMatch[0]);
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) continue;
    }
  }

  throw new AppError('LLM_ERROR', `LLM调用失败: ${lastError?.message}`);
}

async function pmRecommendTeam(task: typeof tasks.$inferSelect) {
  const { pm, model, members } = await loadPMModel(task.teamId);
  const brief = safeJsonParse<any>(task.brief, {});

  const aiModel = createModel({ apiKey: model.apiKey, baseURL: model.baseUrl, modelId: model.modelId });
  const memberList = members.map(m => `- ${m.name} (ID: ${m.id}): ${m.description || '无描述'}`).join('\n');

  const prompt = `你是项目经理。根据以下任务书，从团队成员中选择合适的人员参与任务，并为每人生成任务上下文提示词。

任务书：
${JSON.stringify(brief, null, 2)}

可选团队成员：
${memberList}

请以JSON格式返回，格式如下：
{
  "pm": { "id": "${pm.id}", "name": "${pm.name}" },
  "members": [
    { "id": "成员ID", "name": "成员名称", "taskPrompt": "该成员在本任务中的具体职责和指导..." }
  ]
}

只返回JSON，不要其他内容。`;

  const raw = await callLLMWithRetry(aiModel as any, prompt);

  // Normalize to prevent hallucinated PM/member IDs from breaking execution.
  const availableMembers = members.filter(m => m.id !== pm.id);
  const byId = new Map(availableMembers.map(m => [m.id, m]));
  const requestedMembers = Array.isArray(raw?.members) ? raw.members : [];
  const normalizedMembers: Array<{ id: string; name: string; taskPrompt: string }> = [];
  const seen = new Set<string>();

  for (const m of requestedMembers) {
    const id = typeof m?.id === 'string' ? m.id : '';
    if (!id || seen.has(id) || !byId.has(id)) continue;
    const base = byId.get(id)!;
    normalizedMembers.push({
      id,
      name: base.name,
      taskPrompt: typeof m?.taskPrompt === 'string' && m.taskPrompt.trim().length > 0
        ? m.taskPrompt
        : (base.description || ''),
    });
    seen.add(id);
  }

  if (normalizedMembers.length === 0) {
    for (const m of availableMembers.slice(0, 3)) {
      normalizedMembers.push({ id: m.id, name: m.name, taskPrompt: m.description || '' });
    }
  }

  return {
    pm: { id: pm.id, name: pm.name },
    members: normalizedMembers,
  };
}

async function pmGeneratePlan(task: typeof tasks.$inferSelect) {
  const { model } = await loadPMModel(task.teamId);
  const brief = safeJsonParse<any>(task.brief, {});
  const teamConfig = safeJsonParse<any>(task.teamConfig, { members: [] });

  const aiModel = createModel({ apiKey: model.apiKey, baseURL: model.baseUrl, modelId: model.modelId });
  const memberList = teamConfig.members?.map((m: any) => `- ${m.name} (ID: ${m.id}): ${m.taskPrompt || '无特定指导'}`).join('\n') || '无成员';

  const prompt = `你是项目经理。根据任务书和团队配置，生成执行计划（子任务拆解）。

任务书：
${JSON.stringify(brief, null, 2)}

参与成员：
${memberList}

请以JSON格式返回执行计划，格式如下：
{
  "subtasks": [
    {
      "id": "sub_唯一ID",
      "title": "子任务标题",
      "description": "详细描述",
      "assigneeId": "负责人ID",
      "dependsOn": []
    }
  ]
}

注意：
1. 子任务应该有合理的粒度
2. dependsOn 是该子任务依赖的其他子任务ID数组
3. assigneeId 必须是参与成员的ID
4. 每个子任务的id用 sub_ 前缀加随机字符串

只返回JSON，不要其他内容。`;

  const raw = await callLLMWithRetry(aiModel as any, prompt);
  const memberIds = new Set((teamConfig.members || []).map((m: any) => m.id).filter(Boolean));
  const defaultAssignee = teamConfig.members?.[0]?.id || null;
  let normalized = Array.isArray(raw?.subtasks) ? raw.subtasks : [];

  normalized = normalized
    .filter((st: any) => st && typeof st.title === 'string' && st.title.trim().length > 0)
    .map((st: any, i: number) => ({
      id: typeof st.id === 'string' && st.id.trim().length > 0 ? st.id : `sub_${i + 1}`,
      title: st.title.trim(),
      description: typeof st.description === 'string' ? st.description : '',
      assigneeId: memberIds.has(st.assigneeId) ? st.assigneeId : defaultAssignee,
      dependsOn: Array.isArray(st.dependsOn) ? st.dependsOn.filter((d: unknown) => typeof d === 'string') : [],
    }));

  if (normalized.length === 0) {
    normalized = [{
      id: 'sub_fallback_1',
      title: brief?.title || task.title || '自动补全执行子任务',
      description: brief?.objective || task.description || '请基于任务描述完成交付物并输出总结。',
      assigneeId: defaultAssignee,
      dependsOn: [],
    }];
  }

  return { subtasks: normalized };
}
