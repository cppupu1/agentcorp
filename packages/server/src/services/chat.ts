import { db, employees, employeeChatMessages, employeeTools, tools, models, generateId, now } from '@agentcorp/db';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../errors.js';
import { AgentRunner, createModel } from '@agentcorp/agent-core';
import type { MCPToolConfig, AgentStreamCallbacks } from '@agentcorp/agent-core';

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw); }
  catch { return fallback; }
}

// ---- Session / Message CRUD ----

export async function listSessions(employeeId: string) {
  // Single query: fetch all messages, derive sessions in JS
  const rows = await db
    .select({
      sessionId: employeeChatMessages.sessionId,
      createdAt: employeeChatMessages.createdAt,
      role: employeeChatMessages.role,
      content: employeeChatMessages.content,
    })
    .from(employeeChatMessages)
    .where(eq(employeeChatMessages.employeeId, employeeId))
    .orderBy(employeeChatMessages.createdAt);

  const sessionMap = new Map<string, { createdAt: string; lastAt: string; title: string }>();
  for (const r of rows) {
    if (!sessionMap.has(r.sessionId)) {
      sessionMap.set(r.sessionId, { createdAt: r.createdAt, lastAt: r.createdAt, title: 'New Chat' });
    }
    const entry = sessionMap.get(r.sessionId)!;
    entry.lastAt = r.createdAt; // rows ordered by createdAt, last wins
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
    return bLast.localeCompare(aLast); // most recent first
  });
}

export async function getMessages(employeeId: string, sessionId: string) {
  return db
    .select()
    .from(employeeChatMessages)
    .where(and(
      eq(employeeChatMessages.employeeId, employeeId),
      eq(employeeChatMessages.sessionId, sessionId),
    ))
    .orderBy(employeeChatMessages.createdAt);
}

export async function deleteSession(employeeId: string, sessionId: string) {
  await db.delete(employeeChatMessages).where(and(
    eq(employeeChatMessages.employeeId, employeeId),
    eq(employeeChatMessages.sessionId, sessionId),
  ));
  return { sessionId };
}

// ---- Chat Execution ----

interface ChatParams {
  employeeId: string;
  sessionId: string;
  message: string;
}

// Prevent concurrent sends on the same session
const activeSessionLocks = new Set<string>();

export async function runChat(params: ChatParams, callbacks: AgentStreamCallbacks) {
  const { employeeId, sessionId, message } = params;

  const lockKey = `${employeeId}:${sessionId}`;
  if (activeSessionLocks.has(lockKey)) {
    throw new AppError('VALIDATION_ERROR', '该会话正在处理中，请稍后再试');
  }
  activeSessionLocks.add(lockKey);

  let runner: AgentRunner | null = null;

  try {
    // Load employee with model and tools
    const [emp] = await db.select().from(employees).where(eq(employees.id, employeeId));
    if (!emp) throw new AppError('NOT_FOUND', `员工 ${employeeId} 不存在`);
    if (!emp.modelId) throw new AppError('VALIDATION_ERROR', '该员工未配置模型');

    const [model] = await db.select().from(models).where(eq(models.id, emp.modelId));
    if (!model) throw new AppError('NOT_FOUND', `模型 ${emp.modelId} 不存在`);

    // Load employee's tools
    const empTools = await db
      .select({
        id: tools.id,
        name: tools.name,
        transportType: tools.transportType,
        command: tools.command,
        args: tools.args,
        envVars: tools.envVars,
        enabled: tools.enabled,
      })
      .from(employeeTools)
      .innerJoin(tools, eq(employeeTools.toolId, tools.id))
      .where(eq(employeeTools.employeeId, employeeId));

    const mcpToolConfigs: MCPToolConfig[] = empTools.filter(t => t.enabled !== 0).map(t => ({
      id: t.id,
      name: t.name,
      transportType: (t.transportType ?? 'stdio') as 'stdio' | 'sse',
      command: t.command,
      args: safeJsonParse<string[]>(t.args, []),
      envVars: safeJsonParse<Record<string, string>>(t.envVars, {}),
    }));

    // Save user message
    await db.insert(employeeChatMessages).values({
      id: generateId(),
      employeeId,
      sessionId,
      role: 'user',
      content: message,
      createdAt: now(),
    });

    // Pre-insert assistant message placeholder
    const assistantMsgId = generateId();
    await db.insert(employeeChatMessages).values({
      id: assistantMsgId,
      employeeId,
      sessionId,
      role: 'assistant',
      content: '',
      createdAt: now(),
    });

    // Load history for context
    const history = await db
      .select()
      .from(employeeChatMessages)
      .where(and(
        eq(employeeChatMessages.employeeId, employeeId),
        eq(employeeChatMessages.sessionId, sessionId),
      ))
      .orderBy(employeeChatMessages.createdAt);

    // Build ModelMessage array from history (exclude the placeholder)
    const modelMessages = history
      .filter(m => m.id !== assistantMsgId && m.content)
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: [{ type: 'text' as const, text: m.content }],
      }));

    // Create agent runner
    const aiModel = createModel({
      apiKey: model.apiKey,
      baseURL: model.baseUrl,
      modelId: model.modelId,
    });

    runner = new AgentRunner({
      model: aiModel as any, // AI SDK v5 LanguageModelV1 vs V2 workaround
      systemPrompt: emp.systemPrompt,
      mcpToolConfigs,
      maxSteps: 10,
      assistantMessageId: assistantMsgId,
    });

    // Wrap callbacks to update DB on finish
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
          await db.update(employeeChatMessages).set({
            content: info.text,
            toolCalls: toolCallsAccum.length > 0 ? JSON.stringify(toolCallsAccum) : null,
          }).where(eq(employeeChatMessages.id, assistantMsgId));
        } catch (err) {
          console.error('Failed to persist assistant message:', assistantMsgId, err);
        }
        callbacks.onFinish(info);
      },
    };

    await runner.initialize();
    // Load history (minus last user message which run() will add)
    runner.loadMessages(modelMessages.slice(0, -1));
    await runner.run(message, wrappedCallbacks);
  } finally {
    activeSessionLocks.delete(lockKey);
    if (runner) await runner.cleanup();
  }
}
