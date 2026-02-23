import type { FastifyInstance } from 'fastify';
import { parseIntent } from '../services/ai-parse.js';
import { AppError } from '../errors.js';

export function registerAiParseRoutes(app: FastifyInstance) {
  app.post('/api/ai/parse-intent', async (req) => {
    const { text, type } = req.body as { text: string; type: 'task' | 'team' };
    if (!text?.trim() || !['task', 'team'].includes(type)) {
      throw new AppError('VALIDATION_ERROR', 'text and type required');
    }
    const data = await parseIntent(text.trim(), type);
    return { data };
  });
}
