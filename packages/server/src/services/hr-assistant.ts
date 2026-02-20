import { db, hrChatMessages, models, tools, generateId, now } from '@agentcorp/db';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../errors.js';
import { AgentRunner, createModel } from '@agentcorp/agent-core';
import type { AgentStreamCallbacks } from '@agentcorp/agent-core';
import { tool, jsonSchema } from 'ai';
import type { ToolSet } from 'ai';
import { getSetting } from './system.js';
import { createEmployee } from './employees.js';

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw); }
  catch { return fallback; }
}

const HR_SYSTEM_PROMPT = `你是 AgentCorp 的 HR 助手，专门帮助用户创建和配置 AI 员工。

工作流程：
1. 询问用户需要什么样的员工（角色、职责、技能）
2. 根据描述生成完整的员工配置（名称、描述、系统提示词、推荐工具）
3. 展示配置方案给用户确认
4. 用户可以通过对话修改任何字段
5. 用户确认后，调用 create_employee 工具创建员工

注意事项：
- 生成的系统提示词要专业、详细
- 主动推荐合适的工具（先用 list_tools 查看可用工具）
- 主动推荐合适的模型（先用 list_models 查看可用模型）
- 用中文与用户交流`;

// ---- Session / Message CRUD ----

export async function listSessions() {
  const rows = await db
    .select({
      sessionId: hrChatMessages.sessionId,
      createdAt: hrChatMessages.createdAt,
      role: hrChatMessages.role,
      content: hrChatMessages.content,
    })
    .from(hrChatMessages)
    .orderBy(hrChatMessages.createdAt);

  const sessionMap = new Map<string, { createdAt: string; lastAt: string; title: string }>();
  for (const r of rows) {
    if (!sessionMap.has(r.sessionId)) {
      sessionMap.set(r.sessionId, { createdAt: r.createdAt, lastAt: r.createdAt, title: 'New Chat' });
    }
    const entry = sessionMap.get(r.sessionId)!;
    entry.lastAt = r.createdAt;
    if (entry.title === 'New Chat' && r.role === 'user' && r.content) {
      entry.title = r.content.slice(0, 50);
    }
  }

  return Array.from(sessionMap, ([id, v]) => ({
    id,
    title: v.title,
    createdAt: v.createdAt,
  })).sort((a, b) => {
    const aLast = sessionMap.get(a.id)!.lastAt;
    const bLast = sessionMap.get(b.id)!.lastAt;
    return bLast.localeCompare(aLast);
  });
}

export async function getMessages(sessionId: string) {
  return db
    .select()
    .from(hrChatMessages)
    .where(eq(hrChatMessages.sessionId, sessionId))
    .orderBy(hrChatMessages.createdAt);
}

export async function deleteSession(sessionId: string) {
  await db.delete(hrChatMessages).where(eq(hrChatMessages.sessionId, sessionId));
  return { sessionId };
}

// ---- Internal Tools ----

function buildInternalTools(): ToolSet {
  return {
    create_employee: tool<unknown, string>({
      description: '创建一个新的AI员工。在用户确认配置方案后调用此工具。',
      inputSchema: jsonSchema({
        type: 'object' as const,
        properties: {
          name: { type: 'string', description: '员工名称' },
          description: { type: 'string', description: '员工描述' },
          modelId: { type: 'string', description: '模型ID' },
          systemPrompt: { type: 'string', description: '系统提示词' },
          tags: { type: 'array', items: { type: 'string' }, description: '标签列表' },
          toolIds: { type: 'array', items: { type: 'string' }, description: '工具ID列表' },
        },
        required: ['name', 'modelId', 'systemPrompt'],
      }),
      execute: async (args: any) => {
        try {
          const emp = await createEmployee({
            name: args.name,
            description: args.description,
            modelId: args.modelId,
            systemPrompt: args.systemPrompt,
            tags: args.tags,
            toolIds: args.toolIds,
          });
          return JSON.stringify({ success: true, employeeId: emp.id, name: emp.name });
        } catch (err) {
          return JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) });
        }
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

    list_tools: tool<unknown, string>({
      description: '列出所有可用的工具',
      inputSchema: jsonSchema({ type: 'object' as const, properties: {} }),
      execute: async () => {
        const rows = await db.select({ id: tools.id, name: tools.name, description: tools.description }).from(tools);
        return JSON.stringify(rows);
      },
    }),
  };
}

// ---- Chat Execution ----

interface HrChatParams {
  sessionId: string;
  message: string;
}

const activeSessionLocks = new Set<string>();

export async function runHrChat(params: HrChatParams, callbacks: AgentStreamCallbacks) {
  const { sessionId, message } = params;

  if (activeSessionLocks.has(sessionId)) {
    throw new AppError('VALIDATION_ERROR', '该会话正在处理中，请稍后再试');
  }
  activeSessionLocks.add(sessionId);

  let runner: AgentRunner | null = null;

  try {
    // Get HR assistant model from settings
    const modelId = getSetting('hr_assistant_model_id');
    if (!modelId) throw new AppError('VALIDATION_ERROR', '未配置HR助手模型，请在系统设置中配置 hr_assistant_model_id');

    const [model] = await db.select().from(models).where(eq(models.id, modelId));
    if (!model) throw new AppError('NOT_FOUND', `模型 ${modelId} 不存在`);

    // Save user message
    await db.insert(hrChatMessages).values({
      id: generateId(),
      sessionId,
      role: 'user',
      content: message,
      createdAt: now(),
    });

    // Pre-insert assistant message placeholder
    const assistantMsgId = generateId();
    await db.insert(hrChatMessages).values({
      id: assistantMsgId,
      sessionId,
      role: 'assistant',
      content: '',
      createdAt: now(),
    });

    // Load history
    const history = await db
      .select()
      .from(hrChatMessages)
      .where(eq(hrChatMessages.sessionId, sessionId))
      .orderBy(hrChatMessages.createdAt);

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
      systemPrompt: HR_SYSTEM_PROMPT,
      mcpToolConfigs: [],
      internalTools: buildInternalTools(),
      maxSteps: 10,
      assistantMessageId: assistantMsgId,
    });

    // Wrap callbacks to persist on finish
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
          await db.update(hrChatMessages).set({
            content: info.text,
            toolCalls: toolCallsAccum.length > 0 ? JSON.stringify(toolCallsAccum) : null,
          }).where(eq(hrChatMessages.id, assistantMsgId));
        } catch (err) {
          console.error('Failed to persist HR assistant message:', assistantMsgId, err);
        }
        callbacks.onFinish(info);
      },
    };

    await runner.initialize();
    runner.loadMessages(modelMessages.slice(0, -1));
    await runner.run(message, wrappedCallbacks);
  } finally {
    activeSessionLocks.delete(sessionId);
    if (runner) await runner.cleanup();
  }
}
