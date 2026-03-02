import { db, pmChatMessages, models, teams, tools, teamTools, tasks, generateId, now } from '@agentcorp/db';
import { eq, sql, desc } from 'drizzle-orm';
import { AppError } from '../errors.js';
import { AgentRunner, createModel } from '@agentcorp/agent-core';
import type { AgentStreamCallbacks } from '@agentcorp/agent-core';
import { tool, jsonSchema } from 'ai';
import type { ToolSet } from 'ai';
import { getSetting } from './system.js';
import { listTemplates } from './templates.js';
import { quickCreateTask, createTask, autoStartTask } from './tasks.js';
import { listTeams, updateTeam } from './teams.js';

const PM_SYSTEM_PROMPT = `你是 AgentCorp 的 PM（项目经理）助手，专门帮助用户规划和创建任务。

工作流程：
1. 了解用户想要完成的目标
2. 推荐合适的场景模板（先用 list_templates 查看可用模板）
3. 如果用户已有团队，用 list_teams 查看可用团队
4. 帮助用户细化任务描述、选择执行模式（auto/suggest）
5. 用户确认后，调用 quick_create_task（模板创建）或 create_task（指定团队）创建任务
6. 创建成功后，用 list_tools 查看可用工具，根据任务需求选择合适的工具，调用 assign_team_tools 分配给团队
7. 最后调用 start_task 启动任务执行

注意事项：
- 主动推荐合适的场景模板
- 帮助用户把模糊需求转化为清晰的任务描述
- 创建任务时务必提供清晰的 title（任务标题）
- 当用户明确表达“安排/发起/创建/执行/启动任务”时，必须进入任务流：创建任务→分配工具→启动任务，不能直接给业务最终稿
- 只要用户是在提业务需求且没有明确要求“仅咨询不建任务”，默认按可执行任务处理并直接落地
- 当用户明确要求“直接创建/直接启动”时，禁止追问补充信息或给A/B选项；缺失信息请自行做合理假设并先创建可执行任务
- 信息不完整时，也要先创建并启动任务，在任务描述中写明假设与待确认项，而不是停留在咨询阶段
- 创建任务后，根据任务内容智能选择需要的工具（不要全部分配，只选相关的）
- 分配工具后必须调用 start_task 自动启动，不要让任务停留在草稿状态
- 用户不需要懂工具细节；即使未手动分配，start_task 也会自动补齐关键工具
- 如果用户需求复杂，建议拆分为多个任务
- 用中文与用户交流`;

function recommendToolIdsByTask(taskText: string, enabledTools: Array<{ id: string; name: string; description: string | null; groupName: string | null }>): string[] {
  const text = (taskText || '').toLowerCase();
  const picks = new Set<string>();

  const pickByPattern = (pattern: RegExp) => {
    for (const t of enabledTools) {
      // Prefer matching stable identifiers (id/name/group) to avoid accidental picks from verbose descriptions.
      const hay = `${t.id} ${t.name} ${t.groupName || ''}`.toLowerCase();
      if (pattern.test(hay)) picks.add(t.id);
    }
  };

  const isContent = /新闻稿|文案|社媒|帖子|发布短文|内容创作|营销|品牌|公众号|微博|linkedin|小红书/.test(text);
  const isStock = /股票|a股|港股|美股|行情|财报|估值|投资|股价|k线|\\b\\d{6}\\b|\\b(300750|600519)\\b|\\b[036]\\d{5}\\.(sz|sh)\\b/.test(text);
  const isCustomerOps = !isContent && (/(sop|工单|投诉|订单|延迟|服务流程|faq|客诉|售后)/.test(text)
    || (/客服/.test(text) && /流程|投诉|工单|支持|响应|处理|优化|运营|faq/.test(text)));
  const hasMemoryIntent = /memory|记忆|知识图谱|知识库|知识沉淀|知识条目|沉淀/.test(text);
  // Customer-ops tasks often contain "分析"; keep them out of generic research routing.
  const isResearch = !isContent && !isCustomerOps && /研究|趋势|行业|简报|分析|调研|竞品|政策/.test(text);

  if (isContent) {
    // Content generation tasks should keep toolset minimal; only add search when factual references are requested.
    if (/数据|来源|事实|行业|趋势|引用|参考|日期|发布时间/.test(text)) {
      pickByPattern(/bocha|web fetch|搜索|search|fetch/);
    }
    return Array.from(picks);
  }

  if (isStock) {
    pickByPattern(/tushare|akshare|yahoo finance|yfinance|金融数据/);
    pickByPattern(/bocha|web fetch|搜索|search|fetch/);
    pickByPattern(/当前时间|clock|time/);
  } else if (isResearch) {
    pickByPattern(/bocha|web fetch|搜索|search|fetch/);
    pickByPattern(/当前时间|clock|time/);
  } else if (isCustomerOps) {
    pickByPattern(/bocha|web fetch|搜索|search|fetch/);
  }

  if (hasMemoryIntent || isCustomerOps) {
    pickByPattern(/memory|记忆|知识图谱/);
  }

  return Array.from(picks);
}

async function autoAssignRecommendedToolsForTask(taskId: string): Promise<{ teamId: string | null; added: number; recommended: number }> {
  const [task] = await db
    .select({ id: tasks.id, teamId: tasks.teamId, title: tasks.title, description: tasks.description })
    .from(tasks)
    .where(eq(tasks.id, taskId));
  if (!task?.teamId) return { teamId: null, added: 0, recommended: 0 };

  const enabledTools = await db
    .select({ id: tools.id, name: tools.name, description: tools.description, groupName: tools.groupName })
    .from(tools)
    .where(eq(tools.enabled, 1));
  const taskText = `${task.title || ''}\n${task.description || ''}`;
  const recommended = recommendToolIdsByTask(taskText, enabledTools);
  if (recommended.length === 0) return { teamId: task.teamId, added: 0, recommended: 0 };

  const existing = await db
    .select({ toolId: teamTools.toolId })
    .from(teamTools)
    .where(eq(teamTools.teamId, task.teamId));
  const existingSet = new Set(existing.map(r => r.toolId));
  const toAdd = recommended.filter(id => !existingSet.has(id));

  if (toAdd.length > 0) {
    await db.insert(teamTools).values(toAdd.map(toolId => ({ teamId: task.teamId!, toolId }))).onConflictDoNothing();
  }

  return { teamId: task.teamId, added: toAdd.length, recommended: recommended.length };
}

function parseTaskIdFromPayload(payload: unknown): string | null {
  if (!payload) return null;
  if (typeof payload === 'string') {
    try { return parseTaskIdFromPayload(JSON.parse(payload)); }
    catch { return null; }
  }
  if (typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  if (typeof obj.taskId === 'string') return obj.taskId;
  if (obj.data && typeof obj.data === 'object') {
    const nested = obj.data as Record<string, unknown>;
    if (typeof nested.taskId === 'string') return nested.taskId;
  }
  return null;
}

function collectCreatedAndStartedTaskIds(toolCalls: any[]): { created: Set<string>; started: Set<string> } {
  const created = new Set<string>();
  const started = new Set<string>();
  for (const tc of toolCalls) {
    const toolName = tc?.toolName;
    if (toolName === 'quick_create_task' || toolName === 'create_task') {
      const taskId = parseTaskIdFromPayload(tc?.result);
      if (taskId) created.add(taskId);
    }
    if (toolName === 'start_task') {
      const taskIdFromArgs = typeof tc?.args?.taskId === 'string' ? tc.args.taskId : null;
      const taskIdFromResult = parseTaskIdFromPayload(tc?.result);
      const taskId = taskIdFromArgs || taskIdFromResult;
      if (taskId) started.add(taskId);
    }
  }
  return { created, started };
}

function hasDirectExecutionIntent(message: string): boolean {
  const raw = (message || '').toLowerCase();
  if (!raw.trim()) return false;
  const negative = /(?:不要|别|无需|不用|先别|先不要|不需要|仅咨询|只咨询|只聊|先聊|先讨论).{0,8}(?:创建|发起|启动|执行|安排|任务)|don't\s+create|just\s+discuss|consult\s+only/i;
  if (negative.test(raw)) return false;
  const action = /(?:创建|发起|启动|执行|安排|新建|拉起).{0,6}任务|quick_create_task|create_task|start_task|kick\s*off|create\s+and\s+start/i;
  if (!action.test(raw)) return false;
  return /直接|立即|马上|立刻|现在|尽快|please|请|start now|right away|asap/i.test(raw) || /任务[:：]/.test(raw);
}

function pickTemplateIdForMessage(message: string): string {
  const text = message || '';
  if (/翻译|通知|公告|邮件|文案|双语|润色|改写|宣传|发布稿|社媒/.test(text)) return 'content-creation';
  if (/股票|A股|港股|美股|股价|财报|估值|行情|K线|投资/.test(text)) return 'data-analysis';
  if (/研究|趋势|行业|研报|调研|竞品|政策|分析报告/.test(text)) return 'research-report';
  if (/客服|工单|投诉|售后|服务流程|FAQ|知识库/.test(text)) return 'customer-service';
  if (/开发|代码|前端|后端|接口|部署|测试|bug|缺陷/.test(text)) return 'software-dev';
  return 'content-creation';
}

function deriveTaskTitle(message: string): string {
  const compact = (message || '').replace(/\s+/g, ' ').trim();
  if (!compact) return '自动创建任务';
  const tail = compact.split(/[:：]/).slice(-1)[0]?.trim() || compact;
  const cleaned = tail
    .replace(/^(请|帮我|麻烦|请直接|直接|立即|马上|立刻|现在)\s*/g, '')
    .replace(/^(创建|发起|启动|执行|安排)\s*/g, '')
    .replace(/^任务\s*/g, '')
    .trim();
  const firstClause = (cleaned || compact).split(/[。！？!?\n]/)[0].trim();
  return (firstClause || '自动创建任务').slice(0, 60);
}

function deriveTaskDescription(message: string): string {
  const raw = (message || '').trim();
  const base = raw || '请基于用户意图完成任务交付。';
  return `${base}\n\n补充要求：若关键细节缺失，请基于合理假设继续执行，并在产出中标注假设与限制。`;
}

// ---- Session / Message CRUD ----

export async function listPmSessions() {
  const rows = db.all<{ id: string; created_at: string; last_at: string; title: string | null }>(sql`
    SELECT
      session_id AS id,
      MIN(created_at) AS created_at,
      MAX(created_at) AS last_at,
      (SELECT substr(m2.content, 1, 50) FROM pm_chat_messages m2
       WHERE m2.session_id = m1.session_id AND m2.role = 'user'
       ORDER BY m2.created_at LIMIT 1) AS title
    FROM pm_chat_messages m1
    GROUP BY session_id
    ORDER BY last_at DESC
  `);

  return rows.map(r => ({
    id: r.id,
    title: r.title || 'New Chat',
    createdAt: r.created_at,
  }));
}

export async function getPmMessages(sessionId: string) {
  return db
    .select()
    .from(pmChatMessages)
    .where(eq(pmChatMessages.sessionId, sessionId))
    .orderBy(pmChatMessages.createdAt);
}

export async function deletePmSession(sessionId: string) {
  await db.delete(pmChatMessages).where(eq(pmChatMessages.sessionId, sessionId));
  return { sessionId };
}

// ---- Internal Tools ----

function buildInternalTools(): ToolSet {
  return {
    list_templates: tool<unknown, string>({
      description: '列出所有可用的场景模板',
      inputSchema: jsonSchema({ type: 'object' as const, properties: {} }),
      execute: async () => {
        const tpls = listTemplates();
        return JSON.stringify(tpls);
      },
    }),

    list_models: tool<unknown, string>({
      description: '列出所有可用的AI模型',
      inputSchema: jsonSchema({ type: 'object' as const, properties: {} }),
      execute: async () => {
        const rows = await db.select({ id: models.id, name: models.name, modelId: models.modelId }).from(models);
        return JSON.stringify(rows);
      },
    }),

    list_teams: tool<unknown, string>({
      description: '列出所有已有的团队',
      inputSchema: jsonSchema({ type: 'object' as const, properties: {} }),
      execute: async () => {
        const rows = await listTeams();
        return JSON.stringify(rows);
      },
    }),

    list_tools: tool<unknown, string>({
      description: '列出所有可用的工具（MCP服务），用于为团队分配合适的工具',
      inputSchema: jsonSchema({ type: 'object' as const, properties: {} }),
      execute: async () => {
        const rows = await db.select({
          id: tools.id,
          name: tools.name,
          description: tools.description,
          groupName: tools.groupName,
        }).from(tools).where(eq(tools.enabled, 1));
        return JSON.stringify(rows);
      },
    }),

    assign_team_tools: tool<unknown, string>({
      description: '为团队分配工具。根据任务需求选择合适的工具ID列表，不要全部分配。',
      inputSchema: jsonSchema({
        type: 'object' as const,
        properties: {
          teamId: { type: 'string', description: '团队ID（从创建任务的返回结果中获取）' },
          toolIds: { type: 'array', items: { type: 'string' }, description: '要分配的工具ID列表' },
        },
        required: ['teamId', 'toolIds'],
      }),
      execute: async (args: any) => {
        if (!Array.isArray(args.toolIds) || args.toolIds.length === 0) {
          return JSON.stringify({ success: false, error: 'toolIds must be a non-empty array' });
        }
        try {
          await updateTeam(args.teamId, { toolIds: args.toolIds });
          return JSON.stringify({ success: true, count: args.toolIds.length });
        } catch (err) {
          return JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    }),

    quick_create_task: tool<unknown, string>({
      description: '基于场景模板快速创建任务。需要模板ID、任务标题和描述。模型ID可省略，省略时使用系统默认模型。',
      inputSchema: jsonSchema({
        type: 'object' as const,
        properties: {
          templateId: { type: 'string', description: '场景模板ID' },
          modelId: { type: 'string', description: '模型ID' },
          title: { type: 'string', description: '任务标题（简短明确）' },
          description: { type: 'string', description: '任务描述' },
          mode: { type: 'string', description: '执行模式: auto 或 suggest', enum: ['auto', 'suggest'] },
          teamName: { type: 'string', description: '自定义团队名称（可选）' },
        },
        required: ['templateId', 'title', 'description'],
      }),
      execute: async (args: any) => {
        try {
          const preferredModelId = getPmAssistantModelId();
          const task = await quickCreateTask({
            ...args,
            modelId: preferredModelId || args.modelId,
          });
          return JSON.stringify({ success: true, taskId: task.id, teamId: task.teamId, title: task.title });
        } catch (err) {
          return JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    }),

    create_task: tool<unknown, string>({
      description: '在已有团队中创建任务。需要团队ID、任务标题和描述。',
      inputSchema: jsonSchema({
        type: 'object' as const,
        properties: {
          teamId: { type: 'string', description: '团队ID' },
          title: { type: 'string', description: '任务标题（简短明确）' },
          description: { type: 'string', description: '任务描述' },
          mode: { type: 'string', description: '执行模式: auto 或 suggest', enum: ['auto', 'suggest'] },
        },
        required: ['teamId', 'title', 'description'],
      }),
      execute: async (args: any) => {
        try {
          const task = await createTask(args);
          return JSON.stringify({ success: true, taskId: task.id, teamId: task.teamId, title: task.title });
        } catch (err) {
          return JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    }),

    start_task: tool<unknown, string>({
      description: '启动已创建的任务，自动进入执行流程。创建任务后必须调用此工具。',
      inputSchema: jsonSchema({
        type: 'object' as const,
        properties: {
          taskId: { type: 'string', description: '任务ID（从 quick_create_task 或 create_task 返回）' },
        },
        required: ['taskId'],
      }),
      execute: async (args: any) => {
        try {
          const autoAssigned = await autoAssignRecommendedToolsForTask(args.taskId);
          await autoStartTask(args.taskId);
          return JSON.stringify({
            success: true,
            taskId: args.taskId,
            message: '任务已启动',
            autoAssignedTools: autoAssigned,
          });
        } catch (err) {
          return JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    }),
  };
}

// ---- Chat Execution ----

interface PmChatParams {
  sessionId: string;
  message: string;
}

export function getPmAssistantModelId(): string | null {
  return (
    getSetting('pm_assistant_model_id')
    || getSetting('hr_assistant_model_id')
    || getSetting('default_model_id')
    || null
  );
}

const activeSessionLocks = new Set<string>();

function getPmAssistantTimeoutMs(): number {
  const raw = getSetting('pm_assistant_timeout_seconds');
  const parsed = raw ? parseInt(raw, 10) : 90;
  const seconds = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 30), 600) : 90;
  return seconds * 1000;
}

export async function runPmChat(params: PmChatParams, callbacks: AgentStreamCallbacks) {
  const { sessionId, message } = params;

  if (activeSessionLocks.has(sessionId)) {
    throw new AppError('VALIDATION_ERROR', '该会话正在处理中，请稍后再试');
  }
  activeSessionLocks.add(sessionId);

  let runner: AgentRunner | null = null;

  try {
    // Fallback order: PM-specific model -> HR model -> default model.
    const modelId = getPmAssistantModelId();
    if (!modelId) throw new AppError('VALIDATION_ERROR', '未配置PM助手模型，请在模型管理中设置默认模型或PM专用模型');

    const [model] = await db.select().from(models).where(eq(models.id, modelId));
    if (!model) throw new AppError('NOT_FOUND', `模型 ${modelId} 不存在`);

    // Save user message
    await db.insert(pmChatMessages).values({
      id: generateId(),
      sessionId,
      role: 'user',
      content: message,
      createdAt: now(),
    });

    // Pre-insert assistant message placeholder
    const assistantMsgId = generateId();
    await db.insert(pmChatMessages).values({
      id: assistantMsgId,
      sessionId,
      role: 'assistant',
      content: '',
      createdAt: now(),
    });

    // Load history
    const history = await db
      .select()
      .from(pmChatMessages)
      .where(eq(pmChatMessages.sessionId, sessionId))
      .orderBy(pmChatMessages.createdAt);

    const modelMessages = history
      .filter(m => m.id !== assistantMsgId && m.content)
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: [{ type: 'text' as const, text: m.content }],
      }));

    // Create agent runner with internal tools
    const aiModel = createModel({
      apiKey: model.apiKey,
      baseURL: model.baseUrl,
      modelId: model.modelId,
    });

    runner = new AgentRunner({
      model: aiModel as any,
      systemPrompt: PM_SYSTEM_PROMPT,
      mcpToolConfigs: [],
      internalTools: buildInternalTools(),
      maxSteps: 15,
      assistantMessageId: assistantMsgId,
    });

    // Wrap callbacks to persist on finish
    const toolCallsAccum: unknown[] = [];
    const directExecutionIntent = hasDirectExecutionIntent(message);
    const wrappedCallbacks: AgentStreamCallbacks = {
      onTextDelta: callbacks.onTextDelta,
      onToolCall: (id, toolName, args) => {
        toolCallsAccum.push({ id, toolName, args });
        callbacks.onToolCall(id, toolName, args);
      },
      onToolResult: (id, toolName, result, isError) => {
        const tc = toolCallsAccum.find((entry: any) => entry.id === id) as any;
        if (tc) { tc.result = result; tc.isError = isError; }
        callbacks.onToolResult(id, toolName, result, isError);
      },
      onStepFinish: callbacks.onStepFinish,
      onError: callbacks.onError,
      onFinish: async (info) => {
        try {
          // Safety net:
          // 1) If user clearly asked to directly create/start task but PM asked follow-up instead, auto-create one.
          // 2) If PM created task(s) but forgot start_task, auto-start them here.
          let finalContent = info.text;
          const fallbackToolCalls: unknown[] = [];
          const { created, started } = collectCreatedAndStartedTaskIds(toolCallsAccum as any[]);
          let autoCreatedTask: { id: string; teamId: string | null; title: string | null } | null = null;

          const needsAutoCreate = created.size === 0
            && directExecutionIntent;
          if (needsAutoCreate) {
            const templateId = pickTemplateIdForMessage(message);
            const preferredModelId = getPmAssistantModelId();
            try {
              if (!preferredModelId) throw new Error('未配置默认模型，无法自动创建任务');
              const createArgs = {
                templateId,
                modelId: preferredModelId,
                title: deriveTaskTitle(message),
                description: deriveTaskDescription(message),
                mode: 'auto',
              };
              const task = await quickCreateTask(createArgs);
              autoCreatedTask = { id: task.id, teamId: task.teamId ?? null, title: task.title ?? null };
              created.add(task.id);
              fallbackToolCalls.push({
                id: `auto_create_${task.id}`,
                toolName: 'quick_create_task',
                args: createArgs,
                result: JSON.stringify({
                  success: true,
                  taskId: task.id,
                  teamId: task.teamId,
                  title: task.title,
                  autoFallback: true,
                }),
                isError: false,
              });
            } catch (err) {
              fallbackToolCalls.push({
                id: `auto_create_error_${Date.now()}`,
                toolName: 'quick_create_task',
                args: {
                  templateId,
                  title: deriveTaskTitle(message),
                },
                result: JSON.stringify({
                  success: false,
                  autoFallback: true,
                  error: err instanceof Error ? err.message : String(err),
                }),
                isError: true,
              });
            }
          }

          for (const taskId of created) {
            if (started.has(taskId)) continue;
            try {
              const [task] = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.id, taskId));
              if (!task || task.status !== 'draft') continue;
              const autoAssigned = await autoAssignRecommendedToolsForTask(taskId);
              await autoStartTask(taskId);
              fallbackToolCalls.push({
                id: `auto_start_${taskId}`,
                toolName: 'start_task',
                args: { taskId },
                result: JSON.stringify({
                  success: true,
                  taskId,
                  message: '任务已自动启动（系统兜底）',
                  autoAssignedTools: autoAssigned,
                  autoFallback: true,
                }),
                isError: false,
              });
            } catch (err) {
              fallbackToolCalls.push({
                id: `auto_start_${taskId}`,
                toolName: 'start_task',
                args: { taskId },
                result: JSON.stringify({
                  success: false,
                  taskId,
                  autoFallback: true,
                  error: err instanceof Error ? err.message : String(err),
                }),
                isError: true,
              });
            }
          }

          if (autoCreatedTask) {
            finalContent = `已按你的要求自动创建并启动任务（系统兜底）：${autoCreatedTask.title || '未命名任务'}（任务ID: ${autoCreatedTask.id}）。缺失细节将由执行阶段基于合理假设补齐。`;
          } else if (directExecutionIntent && created.size > 0) {
            const taskIds = Array.from(created);
            const primaryTaskId = taskIds[taskIds.length - 1];
            const [primaryTask] = await db.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, primaryTaskId));
            finalContent = `已按你的要求创建并启动任务：${primaryTask?.title || '未命名任务'}（任务ID: ${primaryTaskId}）。任务正在执行，可在任务面板查看进度与结果。`;
          }

          await db.update(pmChatMessages).set({
            content: finalContent,
            toolCalls: (toolCallsAccum.length + fallbackToolCalls.length) > 0
              ? JSON.stringify([...toolCallsAccum, ...fallbackToolCalls])
              : null,
          }).where(eq(pmChatMessages.id, assistantMsgId));
        } catch (err) {
          console.error('Failed to persist PM assistant message:', assistantMsgId, err);
        }
        callbacks.onFinish(info);
      },
    };

    await runner.initialize();
    runner.loadMessages(modelMessages.slice(0, -1));

    const runAbort = new AbortController();
    const timeoutMs = getPmAssistantTimeoutMs();
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        runAbort.abort();
        reject(new Error(`PM助手执行超时（${Math.round(timeoutMs / 1000)}秒）`));
      }, timeoutMs);
      runAbort.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
    });

    await Promise.race([
      runner.run(message, wrappedCallbacks, { signal: runAbort.signal }),
      timeoutPromise,
    ]).finally(() => {
      runAbort.abort();
    });
  } finally {
    activeSessionLocks.delete(sessionId);
    if (runner) await runner.cleanup();
  }
}
