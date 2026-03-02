import { db, models } from '@agentcorp/db';
import { eq } from 'drizzle-orm';
import { createModel } from '@agentcorp/agent-core';
import { generateText } from 'ai';
import { getModelIdForFeature } from './system.js';
import { AppError } from '../errors.js';
import { listTemplates, getTemplate } from './templates.js';

export async function parseIntent(text: string, type: 'task' | 'team') {
  const modelId = getModelIdForFeature('ai_parse_model_id');
  if (!modelId) throw new AppError('VALIDATION_ERROR', 'AI parse model not configured');

  const [model] = await db.select().from(models).where(eq(models.id, modelId));
  if (!model) throw new AppError('NOT_FOUND', `Model ${modelId} not found`);

  const aiModel = createModel({
    apiKey: model.apiKey,
    baseURL: model.baseUrl,
    modelId: model.modelId,
  });

  let prompt: string;
  if (type === 'task') {
    const templates = listTemplates();
    const tplList = templates.map(t => `- id: "${t.id}", name: "${t.name}", desc: "${t.description}"`).join('\n');
    prompt = `Parse the following natural language into a task creation form.
Available team templates:
${tplList}

Return JSON only: {"description": "...", "mode": "suggest"|"auto", "templateId": "<best matching template id or null>", "teamName": "<suggested team name or null>"}.
If the user's intent clearly matches a template scenario, set templateId to that template's id. Otherwise set templateId to null.
User input: ${text}`;
  } else {
    prompt = `Parse the following natural language into a team creation form. Return JSON only: {"name": "...", "description": "...", "scenario": "...", "collaborationMode": "free"|"pipeline"|"debate"|"vote"|"master_slave"}.\nUser input: ${text}`;
  }

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
    // Validate templateId if provided
    let templateId: string | null = null;
    if (typeof parsed.templateId === 'string' && parsed.templateId) {
      try {
        getTemplate(parsed.templateId);
        templateId = parsed.templateId;
      } catch {
        templateId = null;
      }
    }
    return {
      description: typeof parsed.description === 'string' ? parsed.description : '',
      mode: ['suggest', 'auto'].includes(parsed.mode as string) ? parsed.mode : 'suggest',
      templateId,
      teamName: typeof parsed.teamName === 'string' ? parsed.teamName : null,
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
