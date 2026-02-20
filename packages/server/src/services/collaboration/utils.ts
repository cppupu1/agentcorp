import { db, employees, models } from '@agentcorp/db';
import { eq } from 'drizzle-orm';
import { AgentRunner, createModel } from '@agentcorp/agent-core';
import type { AgentStreamCallbacks } from '@agentcorp/agent-core';

/** Run a single agent call and return its text output */
export async function runAgentOnce(
  employeeId: string,
  prompt: string,
  signal: AbortSignal,
): Promise<string> {
  const [emp] = await db.select().from(employees).where(eq(employees.id, employeeId));
  if (!emp || !emp.modelId) throw new Error(`员工 ${employeeId} 不存在或未配置模型`);
  const [empModel] = await db.select().from(models).where(eq(models.id, emp.modelId));
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

  const noopCallbacks: AgentStreamCallbacks = {
    onTextDelta: () => {},
    onToolCall: () => {},
    onToolResult: () => {},
    onStepFinish: () => {},
    onError: (err) => console.error(`Agent error (${emp.name}):`, err.message),
    onFinish: () => {},
  };

  try {
    if (signal.aborted) throw new Error('Task execution aborted');
    await runner.initialize();
    await runner.run(prompt, noopCallbacks);
    return runner.getLastAssistantText();
  } finally {
    await runner.cleanup();
  }
}
