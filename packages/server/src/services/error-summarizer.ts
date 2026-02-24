import { db, errorTraces, models } from '@agentcorp/db';
import { eq } from 'drizzle-orm';
import { createModel } from '@agentcorp/agent-core';
import { generateText } from 'ai';
import { getSetting } from './system.js';

/**
 * Fire-and-forget: generate a human-readable AI summary for an error trace.
 * Called after inserting an error trace — never awaited by the caller.
 */
export async function summarizeError(traceId: string, errorMessage: string): Promise<void> {
  try {
    const modelId = getSetting('hr_assistant_model_id');
    if (!modelId) return;

    const [model] = await db.select().from(models).where(eq(models.id, modelId));
    if (!model) return;

    const aiModel = createModel({
      apiKey: model.apiKey,
      baseURL: model.baseUrl,
      modelId: model.modelId,
    });

    const result = await generateText({
      model: aiModel as any,
      system: 'You are a helpful assistant that explains technical errors in simple, actionable language. Reply in the same language as the error message. Keep it under 2 sentences.',
      prompt: `Explain this error in plain language and suggest a fix:\n\n<error>\n${errorMessage.slice(0, 2000)}\n</error>`,
    });

    const summary = result.text.trim();
    if (summary) {
      await db.update(errorTraces).set({ aiSummary: summary }).where(eq(errorTraces.id, traceId));
    }
  } catch {
    // Fire-and-forget — never throw
  }
}
