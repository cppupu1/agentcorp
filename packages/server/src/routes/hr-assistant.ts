import type { FastifyInstance } from 'fastify';
import { listSessions, getMessages, deleteSession, runHrChat } from '../services/hr-assistant.js';
import type { AgentStreamCallbacks } from '@agentcorp/agent-core';
import { getModelIdForFeature } from '../services/system.js';
import { db, models } from '@agentcorp/db';
import { eq } from 'drizzle-orm';

export function registerHrAssistantRoutes(app: FastifyInstance) {
  app.get('/api/hr-assistant/status', async () => {
    const modelId = getModelIdForFeature('hr_assistant_model_id');
    if (!modelId) return { data: { configured: false } };
    const [model] = await db.select({ id: models.id, name: models.name }).from(models).where(eq(models.id, modelId));
    return { data: { configured: !!model, modelId, modelName: model?.name || null } };
  });

  app.get('/api/hr-assistant/sessions', async () => {
    return listSessions();
  });

  app.get<{ Params: { sessionId: string } }>(
    '/api/hr-assistant/:sessionId/messages',
    async (req) => {
      return getMessages(req.params.sessionId);
    },
  );

  app.delete<{ Params: { sessionId: string } }>(
    '/api/hr-assistant/:sessionId',
    async (req) => {
      return deleteSession(req.params.sessionId);
    },
  );

  app.post<{ Body: { sessionId: string; message: string } }>(
    '/api/hr-assistant/chat',
    async (req, reply) => {
      const { sessionId, message } = req.body;

      if (!sessionId || !message) {
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'sessionId and message are required' } });
      }
      if (message.length > 10000) {
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: '消息长度不能超过10000字符' } });
      }

      reply.hijack();

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      let seq = 0;
      const send = (event: string, data: unknown) => {
        if (!reply.raw.writableEnded) {
          reply.raw.write(`event: ${event}\ndata: ${JSON.stringify({ seq: seq++, ...data as object })}\n\n`);
        }
      };

      const callbacks: AgentStreamCallbacks = {
        onTextDelta: (text) => send('delta', { text }),
        onToolCall: (toolCallId, toolName, args) => send('tool_call', { toolCallId, toolName, args }),
        onToolResult: (toolCallId, toolName, result, isError) => {
          const safeResult = typeof result === 'string' ? result.slice(0, 500).replace(/sk-[a-zA-Z0-9_-]{10,}/g, 'sk-***') : '';
          send('tool_result', { toolCallId, toolName, result: safeResult, isError });
        },
        onStepFinish: (info) => send('step_finish', info),
        onError: (error) => send('error', { message: error.message }),
        onFinish: (info) => {
          send('done', info);
          if (!reply.raw.writableEnded) reply.raw.end();
        },
      };

      try {
        await runHrChat({ sessionId, message }, callbacks);
      } catch (err) {
        if (!reply.raw.headersSent) {
          const msg = err instanceof Error ? err.message : String(err);
          reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
          reply.raw.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: msg } }));
          return;
        }
        if (!reply.raw.writableEnded) {
          const msg = err instanceof Error ? err.message : String(err);
          send('error', { message: msg });
          reply.raw.end();
        }
      }
    },
  );
}
