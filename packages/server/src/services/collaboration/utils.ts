import { db, employees, models, tools, employeeTools, tasks } from '@agentcorp/db';
import { eq, inArray, sql } from 'drizzle-orm';
import { recordTokenUsage } from '../cost-tracker.js';
import { AgentRunner, createModel } from '@agentcorp/agent-core';
import { stripThinkTags } from '../task-executor.js';
import type { AgentStreamCallbacks, MCPToolConfig } from '@agentcorp/agent-core';
import { sseManager } from '../sse-manager.js';
import { getSetting } from '../system.js';
import { logToolCall } from '../observability.js';
import { recordEvidence } from '../evidence.js';

/** Run a single agent call and return its text output */
export async function runAgentOnce(
  employeeId: string,
  prompt: string,
  signal: AbortSignal,
  taskId?: string,
): Promise<string> {
  const [emp] = await db.select().from(employees).where(eq(employees.id, employeeId));
  if (!emp) throw new Error(`员工 ${employeeId} 不存在`);
  const modelId = emp.modelId || getSetting('default_model_id');
  if (!modelId) throw new Error(`员工 ${employeeId} 未配置模型且未设置默认模型`);
  const [empModel] = await db.select().from(models).where(eq(models.id, modelId));
  if (!empModel) throw new Error(`员工模型不存在`);

  const aiModel = createModel({
    apiKey: empModel.apiKey,
    baseURL: empModel.baseUrl,
    modelId: empModel.modelId,
  });

  const runner = new AgentRunner({
    model: aiModel as any,
    systemPrompt: emp.systemPrompt,
    mcpToolConfigs: [],
    maxSteps: 5,
  });

  let totalTokens = 0;

  const noopCallbacks: AgentStreamCallbacks = {
    onTextDelta: () => {},
    onToolCall: () => {},
    onToolResult: () => {},
    onStepFinish: (info) => {
      if (info?.usage && taskId) {
        const stepTokens = (info.usage.inputTokens ?? 0) + (info.usage.outputTokens ?? 0);
        totalTokens += stepTokens;
        recordTokenUsage({
          taskId,
          employeeId,
          modelId,
          inputTokens: info.usage.inputTokens ?? 0,
          outputTokens: info.usage.outputTokens ?? 0,
        }).catch(() => {});
      }
    },
    onError: (err) => console.error(`Agent error (${emp.name}):`, err.message),
    onFinish: () => {},
  };

  try {
    if (signal.aborted) throw new Error('Task execution aborted');
    await runner.initialize();
    await runner.run(prompt, noopCallbacks);
    // Accumulate tokens to task
    if (taskId && totalTokens > 0) {
      await db.update(tasks).set({
        tokenUsage: sql`coalesce(${tasks.tokenUsage}, 0) + ${totalTokens}`,
      }).where(eq(tasks.id, taskId)).catch(() => {});
    }
    return stripThinkTags(runner.getLastAssistantText());
  } finally {
    await runner.cleanup();
  }
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw); }
  catch { return fallback; }
}

/** Load MCP tool configs for an employee (with team tool intersection) */
async function loadEmployeeMcpTools(employeeId: string, teamToolIds: string[]): Promise<MCPToolConfig[]> {
  if (teamToolIds.length === 0) return [];

  const empToolRows = await db
    .select({ id: tools.id, name: tools.name, transportType: tools.transportType, command: tools.command, args: tools.args, envVars: tools.envVars, enabled: tools.enabled })
    .from(employeeTools)
    .innerJoin(tools, eq(employeeTools.toolId, tools.id))
    .where(eq(employeeTools.employeeId, employeeId));

  let toolRows: typeof empToolRows;
  if (empToolRows.length === 0) {
    // Fallback to team tools if employee has none assigned
    toolRows = await db
      .select({ id: tools.id, name: tools.name, transportType: tools.transportType, command: tools.command, args: tools.args, envVars: tools.envVars, enabled: tools.enabled })
      .from(tools)
      .where(inArray(tools.id, teamToolIds));
  } else {
    toolRows = empToolRows.filter(t => teamToolIds.includes(t.id));
  }

  return toolRows
    .filter(t => t.enabled !== 0)
    .map(t => ({
      id: t.id,
      name: t.name,
      transportType: (t.transportType ?? 'stdio') as 'stdio' | 'sse',
      command: t.command,
      args: safeJsonParse<string[]>(t.args, []),
      envVars: safeJsonParse<Record<string, string>>(t.envVars, {}),
    }));
}

export interface RunAgentWithToolsOptions {
  employeeId: string;
  prompt: string;
  signal: AbortSignal;
  teamToolIds: string[];
  taskId: string;
  /** Label for SSE events (e.g. "analysis", "review") */
  phaseLabel: string;
  maxSteps?: number;
}

/** Run an agent with MCP tools and SSE streaming */
export async function runAgentWithTools(opts: RunAgentWithToolsOptions): Promise<string> {
  const { employeeId, prompt, signal, teamToolIds, taskId, phaseLabel, maxSteps = 20 } = opts;

  const [emp] = await db.select().from(employees).where(eq(employees.id, employeeId));
  if (!emp) throw new Error(`员工 ${employeeId} 不存在`);
  const modelId = emp.modelId || getSetting('default_model_id');
  if (!modelId) throw new Error(`员工 ${employeeId} 未配置模型且未设置默认模型`);
  const [empModel] = await db.select().from(models).where(eq(models.id, modelId));
  if (!empModel) throw new Error(`员工模型不存在`);

  const mcpToolConfigs = await loadEmployeeMcpTools(employeeId, teamToolIds);

  const aiModel = createModel({
    apiKey: empModel.apiKey,
    baseURL: empModel.baseUrl,
    modelId: empModel.modelId,
  });

  const runner = new AgentRunner({
    model: aiModel as any,
    systemPrompt: emp.systemPrompt,
    mcpToolConfigs,
    maxSteps,
  });

  // Accumulate full text output
  let allText = '';
  let totalTokens = 0;
  const toolCallTimers = new Map<string, { toolName: string; args: unknown; startMs: number }>();

  const callbacks: AgentStreamCallbacks = {
    onTextDelta: (delta) => {
      allText += delta;
      sseManager.emit(taskId, 'debate_agent_progress', {
        phase: phaseLabel, employeeId, employeeName: emp.name, content: delta,
      });
    },
    onToolCall: (id, toolName, args) => {
      toolCallTimers.set(id, { toolName, args, startMs: Date.now() });
      sseManager.emit(taskId, 'debate_agent_tool', {
        phase: phaseLabel, employeeId, employeeName: emp.name, toolCallId: id, toolName,
      });
    },
    onToolResult: (id, toolName, result) => {
      const timer = toolCallTimers.get(id);
      const durationMs = timer ? Date.now() - timer.startMs : undefined;
      const isError = typeof result === 'string' && result.startsWith('Error');
      toolCallTimers.delete(id);
      // Persist to DB (fire-and-forget)
      logToolCall({ taskId, employeeId, toolName, input: timer?.args, output: result, isError, durationMs }).catch(() => {});
      sseManager.emit(taskId, 'debate_agent_tool_result', {
        phase: phaseLabel, employeeId, employeeName: emp.name, toolCallId: id, toolName,
        resultPreview: typeof result === 'string' ? result.slice(0, 200) : '(object)',
      });
    },
    onStepFinish: (info) => {
      if (info?.usage) {
        const stepTokens = (info.usage.inputTokens ?? 0) + (info.usage.outputTokens ?? 0);
        totalTokens += stepTokens;
        recordTokenUsage({
          taskId,
          employeeId,
          modelId,
          inputTokens: info.usage.inputTokens ?? 0,
          outputTokens: info.usage.outputTokens ?? 0,
        }).catch(() => {});
      }
    },
    onError: (err) => console.error(`Agent error (${emp.name}/${phaseLabel}):`, err.message),
    onFinish: () => {},
  };

  try {
    if (signal.aborted) throw new Error('Task execution aborted');
    await runner.initialize();
    await runner.run(prompt, callbacks);
    const lastText = runner.getLastAssistantText();
    // Accumulate tokens to task
    if (totalTokens > 0) {
      await db.update(tasks).set({
        tokenUsage: sql`coalesce(${tasks.tokenUsage}, 0) + ${totalTokens}`,
      }).where(eq(tasks.id, taskId)).catch(() => {});
    }
    return stripThinkTags(lastText || allText);
  } finally {
    await runner.cleanup();
  }
}
