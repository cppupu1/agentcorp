# SSE 实时推送设计

对应实现：`packages/server/src/sse/`

## 概述

SSE (Server-Sent Events) 用于两个场景：
1. **对话流式输出** — 员工测试对话、PM 对话对齐时的 LLM 流式响应
2. **任务状态推送** — 任务执行过程中的实时状态更新

对话流式输出通过 POST 请求的 SSE 响应实现（请求-响应模式）。
任务状态推送通过独立的 GET SSE 端点实现（长连接订阅模式）。

## 1. 对话流式输出

### 端点

- `POST /api/employees/:id/chat` — 员工测试对话
- `POST /api/employees/generate-prompt` — AI 生成提示词
- `POST /api/tasks/:id/chat` — PM 对话

### 响应格式

Content-Type: `text/event-stream`

所有事件携带 `seq` 序列号（从 1 递增），用于完整性校验。

```
event: delta
data: {"seq":1,"content":"你好"}

event: delta
data: {"seq":2,"content":"，我是"}

event: tool_call
data: {"seq":3,"id":"call_1","name":"web_search","arguments":{"query":"市场趋势"}}

event: tool_result
data: {"seq":4,"id":"call_1","name":"web_search","content":"搜索结果...","isError":false}

event: delta
data: {"seq":5,"content":"根据搜索结果..."}

event: status_change
data: {"seq":6,"status":"brief_review","brief":{"title":"...","objective":"..."}}

event: error
data: {"seq":7,"message":"模型调用失败","code":"LLM_ERROR"}

event: done
data: {"seq":8,"totalSeq":8,"messageId":"msg_xxx","finishReason":"stop","usage":{"inputTokens":1500,"outputTokens":320},"toolCallCount":1}
```

### 事件类型

| 事件 | 说明 | 数据 |
|------|------|------|
| `delta` | LLM 输出的文本增量 | `{ seq, content }` |
| `tool_call` | LLM 发起工具调用 | `{ seq, id, name, arguments }` |
| `tool_result` | 工具调用结果 | `{ seq, id, name, content, isError }` |
| `status_change` | 任务状态变更 | `{ seq, status, brief?, teamConfig?, plan? }` |
| `error` | 错误 | `{ seq, message, code }` |
| `done` | 流结束（含汇总） | `{ seq, totalSeq, messageId, finishReason, usage, toolCallCount }` |

`done` 事件字段说明：
- `totalSeq`：本次流的总事件数，客户端可校验 `seq === totalSeq` 确认无丢失
- `messageId`：assistant 消息的持久化 ID（数据库主键），可通过 GET 接口查询验证。由路由层预插入占位记录获取，run 完成后回填内容
- `finishReason`：`stop`（正常结束）/ `length`（达到 token 上限）/ `tool_calls`（工具调用后结束）/ `error`
- `usage`：Token 消耗统计
- `toolCallCount`：本次对话中的工具调用总次数

### Fastify 实现

```typescript
fastify.post('/api/employees/:id/chat', async (request, reply) => {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  let seq = 0;
  let doneSent = false;
  const sendEvent = (event: string, data: Record<string, unknown>) => {
    seq++;
    reply.raw.write(`event: ${event}\ndata: ${JSON.stringify({ seq, ...data })}\n\n`);
    if (event === 'done') doneSent = true;
  };

  let toolCallCount = 0;
  let totalUsage = { inputTokens: 0, outputTokens: 0 };

  // AgentRunner 保证：无论成功还是失败，都会调用 onFinish（发送 done 事件）
  // 因此外层 catch 仅处理 AgentRunner 自身初始化等极端异常
  try {
    // AgentRunner 内部使用 AI SDK streamText + stopWhen 自动处理工具循环
    await agentRunner.run(message, {
      onTextDelta: (content) => sendEvent('delta', { content }),
      onToolCall: (id, name, args) => {
        toolCallCount++;
        sendEvent('tool_call', { id, name, arguments: args });
      },
      onToolResult: (id, name, result, isError) => sendEvent('tool_result', { id, name, content: result, isError }),
      onStepFinish: ({ usage }) => {
        totalUsage.inputTokens += usage.inputTokens;
        totalUsage.outputTokens += usage.outputTokens;
      },
      onFinish: ({ text, messageId, finishReason }) => {
        // done 事件的 seq 由 sendEvent 自增，totalSeq 等于 done 自身的 seq
        sendEvent('done', { totalSeq: seq + 1, messageId, finishReason, usage: totalUsage, toolCallCount });
      },
      onError: (err) => sendEvent('error', { message: err.message, code: 'LLM_ERROR' }),
    });
  } catch (err) {
    // AgentRunner.run() 双通道：已通过回调发了 error+done，然后 re-throw
    // 这里只在 done 未发送时兜底（极端情况）
    if (!doneSent) {
      sendEvent('error', { message: err.message, code: 'INTERNAL_ERROR' });
      sendEvent('done', { totalSeq: seq + 1, messageId: null, finishReason: 'error', usage: totalUsage, toolCallCount });
    }
  } finally {
    reply.raw.end();
  }
});
```

## 2. 任务状态推送

### 端点

`GET /api/tasks/:id/events`

长连接，客户端通过 EventSource 订阅。

### 事件类型

所有任务推送事件携带 `seq`（每个连接独立递增）和 `timestamp`（ISO 8601）。`seq` 用于检测丢事件和乱序，`timestamp` 用于跨连接排序。

| 事件 | 说明 | 数据 |
|------|------|------|
| `task_status` | 任务状态变更 | `{ seq, taskId, status, previousStatus, timestamp }` |
| `subtask_started` | 子任务开始执行 | `{ seq, subtaskId, title, employeeId, employeeName, timestamp }` |
| `subtask_tool_call` | 子任务中的工具调用 | `{ seq, subtaskId, toolName, arguments, timestamp }` |
| `subtask_tool_result` | 子任务中的工具结果 | `{ seq, subtaskId, toolName, content, isError, timestamp }` |
| `subtask_progress` | 子任务进度文本 | `{ seq, subtaskId, content, timestamp }` |
| `subtask_completed` | 子任务完成 | `{ seq, subtaskId, status, output, usage, timestamp }` |
| `subtask_failed` | 子任务失败 | `{ seq, subtaskId, error, timestamp }` |
| `pm_decision` | PM 决策记录 | `{ seq, decision, reason, timestamp }` |
| `task_completed` | 任务完成 | `{ seq, taskId, result, timestamp }` |
| `heartbeat` | 心跳（每 30s） | `{ seq, timestamp }` |

与之前版本的区别：子任务执行过程拆分为 `started` → `tool_call`/`tool_result`/`progress` → `completed`/`failed`，提供完整的可观测性。AI 可以据此验证：
- 子任务是否分配给了正确的员工
- 工具调用是否符合预期
- 子任务是否在合理时间内完成

### 服务端实现

```typescript
// SSE 连接管理器
class SSEManager {
  private connections: Map<string, Set<{ res: ServerResponse; seq: number }>> = new Map();

  addConnection(taskId: string, res: ServerResponse): void {
    if (!this.connections.has(taskId)) {
      this.connections.set(taskId, new Set());
    }
    const conn = { res, seq: 0 };
    this.connections.get(taskId)!.add(conn);

    res.on('close', () => {
      this.connections.get(taskId)?.delete(conn);
    });
  }

  emit(taskId: string, event: string, data: Record<string, unknown>): void {
    const clients = this.connections.get(taskId);
    if (!clients) return;

    for (const conn of clients) {
      conn.seq++;
      // seq 和 timestamp 由 emit 统一注入，调用方无需手动传入
      const payload = { seq: conn.seq, timestamp: new Date().toISOString(), ...data };
      conn.res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    }
  }
}
```

### 前端订阅

```typescript
function useTaskEvents(taskId: string) {
  useEffect(() => {
    const eventSource = new EventSource(`/api/tasks/${taskId}/events`);

    eventSource.addEventListener('task_status', (e) => {
      const data = JSON.parse(e.data);
      // 更新任务状态
    });

    eventSource.addEventListener('subtask_started', (e) => {
      const data = JSON.parse(e.data);
      // 标记子任务开始
    });

    eventSource.addEventListener('subtask_completed', (e) => {
      const data = JSON.parse(e.data);
      // 更新子任务结果
    });

    eventSource.addEventListener('subtask_failed', (e) => {
      const data = JSON.parse(e.data);
      // 标记子任务失败
    });

    return () => eventSource.close();
  }, [taskId]);
}
```

## 3. 对话流式输出的前端消费

```typescript
async function sendChatMessage(url: string, body: object) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let currentEvent = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7);
      } else if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        handleEvent(currentEvent, data);
      }
    }
  }
}
```

## 设计要点

1. **对话 SSE 是短连接**：POST 请求返回 SSE 流，流结束后连接关闭。不需要重连机制。
2. **任务事件 SSE 是长连接**：GET 请求建立长连接，需要心跳保活和断线重连。
3. **心跳**：任务事件 SSE 每 30s 发送 heartbeat，防止代理/负载均衡器超时断开。
4. **前端 EventSource 自动重连**：浏览器原生 EventSource 有自动重连机制，适合任务事件订阅。对话流式输出使用 fetch + ReadableStream，不需要重连。
5. **序列号校验**：对话 SSE 的每个事件携带 `seq`，`done` 事件的 `totalSeq` 可用于校验完整性。
6. **done 事件汇总**：包含 `messageId`（可查询验证持久化）、`finishReason`（判断结束原因）、`usage`（Token 消耗）、`toolCallCount`（工具调用次数）。
7. **任务事件断线重连策略**：MVP 阶段事件仅存内存，不持久化。客户端重连时（EventSource 自动重连），服务端发送当前任务完整状态快照：一个 `task_status` 事件（含当前状态）+ 所有子任务的当前状态事件。客户端据此刷新 UI，无需事件重放。服务端重启后同理，客户端重连获取最新快照即可。
8. **子任务执行超时**：每个子任务有默认 300s 超时限制（可在 plan 中按子任务配置）。超时后 AgentRunner 强制终止，子任务标记为 `failed`，PM 决定是否重试或跳过。
