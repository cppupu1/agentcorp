import { db, models } from '@agentcorp/db';
import { eq } from 'drizzle-orm';
import { createModel } from '@agentcorp/agent-core';
import { generateText } from 'ai';
import { getSetting } from './system.js';
import { AppError } from '../errors.js';

export async function parseIntent(text: string, type: 'task' | 'team') {
  const modelId = getSetting('hr_assistant_model_id');
  if (!modelId) throw new AppError('VALIDATION_ERROR', 'HR assistant model not configured');

  const [model] = await db.select().from(models).where(eq(models.id, modelId));
  if (!model) throw new AppError('NOT_FOUND', `Model ${modelId} not found`);

  const aiModel = createModel({
    apiKey: model.apiKey,
    baseURL: model.baseUrl,
    modelId: model.modelId,
  });

  const prompt = type === 'task'
    ? `Parse the following natural language into a task creation form. Return JSON only: {"description": "...", "mode": "suggest"|"auto"}.\nUser input: ${text}`
    : `Parse the following natural language into a team creation form. Return JSON only: {"name": "...", "description": "...", "scenario": "...", "collaborationMode": "free"|"pipeline"|"debate"|"vote"|"master_slave"}.\nUser input: ${text}`;

  const result = await generateText({
    model: aiModel as any,
    system: 'You are a form-filling assistant. Parse user intent into structured JSON. Return ONLY valid JSON, no markdown.',
    prompt,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(result.text.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
  } catch {
    throw new AppError('LLM_ERROR', 'Failed to parse AI response');
  }

  if (type === 'task') {
    return {
      description: typeof parsed.description === 'string' ? parsed.description : '',
      mode: ['suggest', 'auto'].includes(parsed.mode as string) ? parsed.mode : 'suggest',
    };
  }
  return {
    name: typeof parsed.name === 'string' ? parsed.name : '',
    description: typeof parsed.description === 'string' ? parsed.description : '',
    scenario: typeof parsed.scenario === 'string' ? parsed.scenario : '',
    collaborationMode: ['free', 'pipeline', 'debate', 'vote', 'master_slave'].includes(parsed.collaborationMode as string)
      ? parsed.collaborationMode : 'free',
  };
}
