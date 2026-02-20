import type { FastifyInstance } from 'fastify';
import { listSessions, getMessages, deleteSession, runChat } from '../services/chat.js';
import type { AgentStreamCallbacks } from '@agentcorp/agent-core';

export function registerChatRoutes(app: FastifyInstance) {
  // List sessions
  app.get<{ Params: { id: string } }>('/api/employees/:id/chat/sessions', async (req) => {
    return listSessions(req.params.id);
  });

  // Get messages for a session
  app.get<{ Params: { id: string; sessionId: string } }>(
    '/api/employees/:id/chat/:sessionId/messages',
    async (req) => {
      return getMessages(req.params.id, req.params.sessionId);
    },
  );

  // Delete session
  app.delete<{ Params: { id: string; sessionId: string } }>(
    '/api/employees/:id/chat/:sessionId',
    async (req) => {
      return deleteSession(req.params.id, req.params.sessionId);
    },
  );

  // Chat with SSE streaming
  app.post<{ Params: { id: string }; Body: { sessionId: string; message: string } }>(
    '/api/employees/:id/chat',
    async (req, reply) => {
      const { id } = req.params;
      const { sessionId, message } = req.body;

      if (!sessionId || !message) {
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'sessionId and message are required' } });
      }
      if (message.length > 10000) {
        return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: '消息长度不能超过10000字符' } });
      }

      // Tell Fastify we're taking over the response
      reply.hijack();

      // Set SSE headers
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
        await runChat({ employeeId: id, sessionId, message }, callbacks);
      } catch (err) {
        if (!reply.raw.headersSent) {
          // hijacked but headers not sent yet — write error as JSON manually
          const msg = err instanceof Error ? err.message : String(err);
          reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
          reply.raw.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: msg } }));
          return;
        }
        // Headers sent but stream may not have been closed (e.g., error during initialize)
        if (!reply.raw.writableEnded) {
          const msg = err instanceof Error ? err.message : String(err);
          send('error', { message: msg });
          reply.raw.end();
        }
      }
    },
  );
}
