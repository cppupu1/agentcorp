import type { FastifyInstance } from 'fastify';
import { AppError } from '../errors.js';
import {
  listTasks, getTask, createTask, deleteTask,
  getTaskMessages, runTaskChat,
  approveBrief, approveTeam, approvePlan,
} from '../services/tasks.js';
import type { TaskChatCallbacks } from '../services/tasks.js';
import { sseManager } from '../services/sse-manager.js';
import { getErrorTrace } from '../services/error-protection.js';

function validateCreate(body: Record<string, unknown>) {
  const errors: Array<{ field: string; rule: string; message: string }> = [];
  const hasTeamId = body.teamId && typeof body.teamId === 'string';
  const hasPmEmployeeId = body.pmEmployeeId && typeof body.pmEmployeeId === 'string';
  if (!hasTeamId && !hasPmEmployeeId) {
    errors.push({ field: 'teamId', rule: 'required', message: 'teamId 或 pmEmployeeId 必须提供其一' });
  }
  if (!body.description || typeof body.description !== 'string' || (body.description as string).length < 1 || (body.description as string).length > 5000) {
    errors.push({ field: 'description', rule: 'required', message: 'description 必填，1-5000 字符' });
  }
  if (body.mode !== undefined && body.mode !== 'suggest' && body.mode !== 'auto') {
    errors.push({ field: 'mode', rule: 'enum', message: 'mode 必须是 suggest 或 auto' });
  }
  if (errors.length > 0) {
    throw new AppError('VALIDATION_ERROR', '请求参数校验失败', { details: errors });
  }
}

export function registerTaskRoutes(app: FastifyInstance) {
  // List tasks
  app.get<{ Querystring: { teamId?: string; status?: string } }>('/api/tasks', async (req) => {
    return { data: await listTasks(req.query.teamId, req.query.status) };
  });

  // Get task detail
  app.get<{ Params: { id: string } }>('/api/tasks/:id', async (req) => {
    return { data: await getTask(req.params.id) };
  });

  // Create task
  app.post<{ Body: Record<string, unknown> }>('/api/tasks', async (req, reply) => {
    validateCreate(req.body);
    const data = await createTask(req.body as any);
    return reply.status(201).send({ data });
  });

  // Delete task
  app.delete<{ Params: { id: string } }>('/api/tasks/:id', async (req) => {
    return { data: await deleteTask(req.params.id) };
  });

  // Get task messages
  app.get<{ Params: { id: string }; Querystring: { type?: string } }>('/api/tasks/:id/messages', async (req) => {
    return { data: await getTaskMessages(req.params.id, req.query.type) };
  });

  // Chat with PM (SSE)
  app.post<{ Params: { id: string }; Body: { message: string } }>('/api/tasks/:id/chat', async (req, reply) => {
    const { id } = req.params;
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'message 必填' } });
    }
    if (message.length > 10000) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: '消息长度不能超过10000字符' } });
    }

    // Validate task state BEFORE hijacking the response
    let task: Awaited<ReturnType<typeof getTask>>;
    try {
      task = await getTask(id);
    } catch (err) {
      if (err instanceof AppError) return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message } });
      return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: '加载任务失败' } });
    }
    if (!['draft', 'aligning'].includes(task.status ?? '')) {
      return reply.status(409).send({
        error: { code: 'INVALID_STATE', message: `当前状态 ${task.status} 不允许对话` },
      });
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    let seq = 0;
    const sendSSE = (event: string, data: unknown) => {
      if (!reply.raw.writableEnded) {
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify({ seq: seq++, ...data as object })}\n\n`);
      }
    };

    const callbacks: TaskChatCallbacks = {
      onTextDelta: (text) => sendSSE('delta', { text }),
      onToolCall: (toolCallId, toolName, args) => sendSSE('tool_call', { toolCallId, toolName, args }),
      onToolResult: (toolCallId, toolName, result, isError) => {
        const safeResult = typeof result === 'string' ? result.slice(0, 500).replace(/sk-[a-zA-Z0-9_-]{10,}/g, 'sk-***') : '';
        sendSSE('tool_result', { toolCallId, toolName, result: safeResult, isError });
      },
      onStepFinish: (info) => sendSSE('step_finish', info),
      onError: (error) => sendSSE('error', { message: error.message }),
      onFinish: (info) => {
        sendSSE('done', info);
        if (!reply.raw.writableEnded) reply.raw.end();
      },
      onStatusChange: (status, data) => sendSSE('status_change', { status, data }),
    };

    try {
      await runTaskChat(id, message, callbacks);
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      const msg = rawMsg.replace(/sk-[a-zA-Z0-9_-]{10,}/g, 'sk-***');
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'Content-Type': 'application/json' });
        reply.raw.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: msg } }));
        return;
      }
      if (!reply.raw.writableEnded) {
        sendSSE('error', { message: msg });
        reply.raw.end();
      }
    }
  });

  // Approve brief
  app.post<{ Params: { id: string }; Body: { approved: boolean; modifications?: Record<string, string> } }>(
    '/api/tasks/:id/approve-brief', async (req) => {
      if (!req.body || typeof req.body.approved !== 'boolean') {
        throw new AppError('VALIDATION_ERROR', 'approved 必须是布尔值');
      }
      return { data: await approveBrief(req.params.id, req.body) };
    },
  );

  // Approve team
  app.post<{ Params: { id: string }; Body: { approved: boolean; adjustments?: { addMembers?: string[]; removeMembers?: string[] } } }>(
    '/api/tasks/:id/approve-team', async (req) => {
      if (!req.body || typeof req.body.approved !== 'boolean') {
        throw new AppError('VALIDATION_ERROR', 'approved 必须是布尔值');
      }
      return { data: await approveTeam(req.params.id, req.body) };
    },
  );

  // Approve plan
  app.post<{ Params: { id: string }; Body: { approved: boolean; feedback?: string } }>(
    '/api/tasks/:id/approve-plan', async (req) => {
      if (!req.body || typeof req.body.approved !== 'boolean') {
        throw new AppError('VALIDATION_ERROR', 'approved 必须是布尔值');
      }
      return { data: await approvePlan(req.params.id, req.body) };
    },
  );

  // SSE: Subscribe to task execution events
  app.get<{ Params: { id: string } }>('/api/tasks/:id/events', async (req, reply) => {
    const task = await getTask(req.params.id);

    if (task.status !== 'executing' && task.status !== 'completed' && task.status !== 'failed') {
      return reply.status(400).send({
        error: { code: 'INVALID_STATE', message: `任务状态为 ${task.status}，不支持事件订阅` },
      });
    }

    // For terminal states, just send the final status and close
    if (task.status === 'completed' || task.status === 'failed') {
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      reply.raw.write(`event: task_status\ndata: ${JSON.stringify({ seq: 0, timestamp: new Date().toISOString(), taskId: task.id, status: task.status })}\n\n`);
      reply.raw.end();
      return;
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const ok = sseManager.addConnection(task.id, reply.raw);
    if (!ok) {
      reply.raw.write(`event: error\ndata: ${JSON.stringify({ message: '连接数已达上限' })}\n\n`);
      reply.raw.end();
      return;
    }

    // Send initial snapshot
    const snapshot = {
      taskId: task.id,
      status: task.status,
      subtasks: task.subtasks.map(s => ({
        id: s.id, title: s.title, status: s.status,
        assigneeId: s.assigneeId, assigneeName: s.assigneeName,
      })),
    };
    reply.raw.write(`event: task_status\ndata: ${JSON.stringify({ seq: 0, timestamp: new Date().toISOString(), ...snapshot })}\n\n`);
  });

  // Get subtasks
  app.get<{ Params: { id: string } }>('/api/tasks/:id/subtasks', async (req) => {
    const task = await getTask(req.params.id);
    return { data: task.subtasks };
  });

  // Get error trace
  app.get<{ Params: { id: string } }>('/api/tasks/:id/error-trace', async (req) => {
    await getTask(req.params.id); // validate task exists
    return { data: await getErrorTrace(req.params.id) };
  });
}
