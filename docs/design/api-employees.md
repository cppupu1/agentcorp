# 员工管理 API

对应实现：`packages/server/src/routes/employees.ts` + `packages/web/src/pages/employees/`

## API 端点

### GET /api/employees

获取员工列表。

查询参数：
- `tag`（可选）：按标签筛选
- `search`（可选）：按名称搜索

响应：
```json
{
  "data": [
    {
      "id": "emp001",
      "name": "资深分析师",
      "avatar": "🧑‍💼",
      "description": "擅长数据分析和报告撰写",
      "modelId": "a1b2c3d4e5f6",
      "modelName": "GPT-4o",
      "systemPrompt": "你是一名资深数据分析师...",
      "tags": ["分析师", "GPT-4o"],
      "toolCount": 3,
      "createdAt": "2026-02-16T12:00:00Z",
      "updatedAt": "2026-02-16T12:00:00Z"
    }
  ]
}
```

### GET /api/employees/:id

获取员工详情，包含关联的工具列表。

响应：
```json
{
  "data": {
    "id": "emp001",
    "name": "资深分析师",
    "avatar": "🧑‍💼",
    "description": "擅长数据分析和报告撰写",
    "modelId": "a1b2c3d4e5f6",
    "modelName": "GPT-4o",
    "systemPrompt": "你是一名资深数据分析师...",
    "tags": ["分析师", "GPT-4o"],
    "tools": [
      { "id": "t1", "name": "网页搜索" },
      { "id": "t2", "name": "Python执行" }
    ],
    "createdAt": "2026-02-16T12:00:00Z",
    "updatedAt": "2026-02-16T12:00:00Z"
  }
}
```

### POST /api/employees

创建员工。

请求：
```json
{
  "name": "资深分析师",
  "avatar": "🧑‍💼",
  "description": "擅长数据分析和报告撰写",
  "modelId": "a1b2c3d4e5f6",
  "systemPrompt": "你是一名资深数据分析师...",
  "tags": ["分析师"],
  "toolIds": ["t1", "t2"]
}
```

后端自动将模型名称追加到 tags 中（自动标签）。

响应：创建后的完整员工对象。

```json
{
  "data": {
    "id": "emp001",
    "name": "资深分析师",
    "avatar": "🧑‍💼",
    "description": "擅长数据分析和报告撰写",
    "modelId": "a1b2c3d4e5f6",
    "modelName": "GPT-4o",
    "systemPrompt": "你是一名资深数据分析师...",
    "tags": ["分析师", "GPT-4o"],
    "toolCount": 2,
    "createdAt": "2026-02-16T12:00:00Z",
    "updatedAt": "2026-02-16T12:00:00Z"
  }
}
```

校验规则：
- `name`：必填，1-100 字符
- `modelId`：必填，必须引用已存在的模型，否则返回 `NOT_FOUND`
- `systemPrompt`：必填
- `tags`：最多 20 个，每个 1-30 字符
- `toolIds`：每个 ID 必须引用已存在的工具，否则返回 `NOT_FOUND`
- 校验失败返回 `VALIDATION_ERROR`

### PUT /api/employees/:id

更新员工。所有字段可选。`toolIds` 传入时整体替换。

响应：更新后的完整员工对象。员工不存在时返回 `NOT_FOUND`。

### DELETE /api/employees/:id

删除员工。

前置检查：如果有团队引用该员工（作为成员或 PM），返回 `CONFLICT` 错误（含引用的团队列表）。

员工不存在时返回 `NOT_FOUND`。

### POST /api/employees/:id/copy

复制员工。

实现：读取原员工全部配置，名称追加"(副本)"后缀，创建新记录。

响应：新员工对象。

### POST /api/employees/generate-prompt

AI 生成系统提示词。

请求：
```json
{
  "name": "资深分析师",
  "role": "数据分析",
  "description": "擅长金融数据分析，能够从海量数据中发现趋势",
  "modelId": "a1b2c3d4e5f6"
}
```

实现逻辑：
1. 使用指定模型（或默认模型），通过 AI SDK `streamText` 调用 LLM
2. 系统提示词：
   ```
   你是一个专业的AI系统提示词工程师。根据用户提供的员工名称、角色和描述，
   生成一份专业的系统提示词。提示词应包含：
   1. 角色定义（你是谁）
   2. 核心职责（你负责什么）
   3. 专业能力（你擅长什么）
   4. 行为准则（你应该如何行动）
   5. 输出规范（你的输出应该是什么格式）

   直接输出系统提示词内容，不要包含任何解释。
   ```
3. 通过 `streamText` 的 `textStream` 流式返回

   ```typescript
   import { streamText } from 'ai';
   import { createModel } from '@agentcorp/agent-core';

   const model = createModel(modelConfig);
   const result = streamText({
     model,
     system: '你是一个专业的AI系统提示词工程师...',
     prompt: `员工名称：${name}\n角色：${role}\n描述：${description}`,
   });

   for await (const chunk of result.textStream) {
     sendSSE('delta', { content: chunk });
   }
   ```

响应：SSE 流

```
event: delta
data: {"seq":1,"content":"你是一名"}

event: delta
data: {"seq":2,"content":"资深数据分析师"}

event: done
data: {"seq":3,"totalSeq":3,"messageId":null,"finishReason":"stop","usage":{"inputTokens":200,"outputTokens":150},"toolCallCount":0}
```

## 员工测试对话

### POST /api/employees/:id/chat

与员工进行测试对话。

请求：
```json
{
  "sessionId": "sess_abc123",
  "message": "帮我分析一下最近的市场趋势"
}
```

实现逻辑：
1. 从数据库加载员工配置（system_prompt、model、tools）
2. 加载该 session 的历史消息
3. 创建 AgentRunner 实例（来自 `@agentcorp/agent-core`）
4. AgentRunner 内部通过 AI SDK `streamText` + `stopWhen` 自动处理工具调用循环
5. 将用户消息和助手回复存入 employee_chat_messages
6. 通过 SSE 流式返回

   ```typescript
   import { AgentRunner, createModel } from '@agentcorp/agent-core';

   // 持久化用户消息
   await db.insert(employeeChatMessages).values({
     employeeId, sessionId, role: 'user', content: message,
   });
   // 预插入 assistant 占位记录，获取 ID（done.messageId 指向 assistant 消息）
   const assistantMsg = await db.insert(employeeChatMessages).values({
     employeeId, sessionId, role: 'assistant', content: '',
   }).returning();

   const model = createModel(modelConfig);
   const runner = new AgentRunner({
     model,
     systemPrompt: employee.systemPrompt,
     mcpToolConfigs: employeeTools,
     maxSteps: 10,
     assistantMessageId: assistantMsg.id,
   });

   await runner.initialize();
   // 加载历史消息到 runner
   runner.loadMessages(historyMessages);

   await runner.run(message, {
     onTextDelta: (text) => sendSSE('delta', { content: text }),
     onToolCall: (id, name, args) => sendSSE('tool_call', { id, name, arguments: args }),
     onToolResult: (id, name, result, isError) => sendSSE('tool_result', { id, name, content: result, isError }),
     onFinish: ({ text, messageId, finishReason }) => sendSSE('done', { totalSeq: seq + 1, messageId, finishReason, usage: totalUsage, toolCallCount }),
     onError: (err) => sendSSE('error', { message: err.message, code: 'LLM_ERROR' }),
   });

   await runner.cleanup();
   ```

响应：SSE 流（所有事件携带 seq，详见 [sse.md](../design/sse.md)）

```
event: delta
data: {"seq":1,"content":"根据我的分析"}

event: tool_call
data: {"seq":2,"id":"call_1","name":"web_search","arguments":{"query":"市场趋势 2026"}}

event: tool_result
data: {"seq":3,"id":"call_1","name":"web_search","content":"搜索结果...","isError":false}

event: delta
data: {"seq":4,"content":"根据最新数据显示..."}

event: done
data: {"seq":5,"totalSeq":5,"messageId":"msg_abc123","finishReason":"stop","usage":{"inputTokens":500,"outputTokens":200},"toolCallCount":1}
```

### GET /api/employees/:id/chat/sessions

获取员工的对话会话列表。

响应：
```json
{
  "data": [
    {
      "sessionId": "sess_abc123",
      "lastMessage": "根据最新数据显示...",
      "messageCount": 5,
      "createdAt": "2026-02-16T12:00:00Z",
      "updatedAt": "2026-02-16T12:30:00Z"
    }
  ]
}
```

### GET /api/employees/:id/chat/:sessionId/messages

获取指定会话的消息历史。

响应：
```json
{
  "data": [
    {
      "id": "msg001",
      "role": "user",
      "content": "帮我分析市场趋势",
      "toolCalls": null,
      "createdAt": "2026-02-16T12:00:00Z"
    },
    {
      "id": "msg002",
      "role": "assistant",
      "content": "根据最新数据显示...",
      "toolCalls": [
        { "id": "call_1", "name": "web_search", "arguments": {"query": "市场趋势 2026"}, "result": "搜索结果..." }
      ],
      "createdAt": "2026-02-16T12:00:10Z"
    }
  ]
}
```

### DELETE /api/employees/:id/chat/:sessionId

删除指定会话。

## 前端页面

### 员工列表页 `/employees`

- 支持卡片/列表视图切换
- 卡片展示：头像、名称、标签、模型名称、工具数量、简介
- 标签筛选栏（横向滚动）
- 搜索框
- 操作：编辑、复制、测试对话、删除
- 右上角"添加员工"按钮

### 员工表单页 `/employees/new` 和 `/employees/:id/edit`

- 独立页面（非 Dialog，因为字段较多）
- 分区：基本信息、大脑选择（模型下拉）、工具分配（多选）、系统提示词
- 系统提示词区域：
  - 手动编写 textarea
  - "AI 生成"按钮：弹出 Dialog 输入角色描述，流式生成后填入 textarea
  - 用户可在 AI 生成的基础上继续编辑
- 标签输入：支持输入新标签 + 从已有标签中选择

### 员工测试对话页 `/employees/:id/chat`

- 标准对话 UI（类 ChatGPT）
- 左侧：会话列表（可新建/删除）
- 右侧：对话区域
  - 消息气泡（用户/助手）
  - 工具调用展示（折叠面板，显示工具名、参数、结果）
  - 流式输出（逐字显示）
  - 底部输入框 + 发送按钮
