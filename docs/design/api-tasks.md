# 任务管理 API

对应实现：`packages/server/src/routes/tasks.ts` + `packages/web/src/pages/tasks/`

## 概述

任务是 AgentCorp 的核心流程，贯穿"创建 → 对齐 → 审批 → 执行 → 交付"全生命周期。任务 API 需要同时支持 REST 操作和 SSE 流式交互。

## API 端点

### GET /api/tasks

获取任务列表。

查询参数：
- `teamId`（可选）：按团队筛选
- `status`（可选）：按状态筛选

响应：
```json
{
  "data": [
    {
      "id": "task001",
      "teamId": "team001",
      "teamName": "数据分析团队",
      "title": "Q4市场分析报告",
      "status": "executing",
      "mode": "suggest",
      "createdAt": "2026-02-16T12:00:00Z",
      "updatedAt": "2026-02-16T14:30:00Z"
    }
  ]
}
```

### GET /api/tasks/:id

获取任务详情，包含任务书、团队配置、执行计划、子任务列表。

响应：
```json
{
  "data": {
    "id": "task001",
    "teamId": "team001",
    "teamName": "数据分析团队",
    "title": "Q4市场分析报告",
    "description": "分析2025年Q4的市场趋势",
    "status": "executing",
    "mode": "suggest",
    "brief": {
      "title": "Q4市场分析报告",
      "objective": "...",
      "deliverables": "...",
      "constraints": "...",
      "acceptanceCriteria": "..."
    },
    "teamConfig": {
      "pm": { "id": "emp001", "name": "分析经理" },
      "members": [
        { "id": "emp002", "name": "数据采集员", "taskPrompt": "..." }
      ]
    },
    "plan": {
      "subtasks": [
        {
          "id": "sub001",
          "title": "数据采集",
          "assigneeId": "emp002",
          "dependsOn": []
        }
      ]
    },
    "subtasks": [
      {
        "id": "sub001",
        "title": "数据采集",
        "assigneeId": "emp002",
        "assigneeName": "数据采集员",
        "status": "completed",
        "dependsOn": [],
        "output": { "summary": "..." }
      }
    ],
    "createdAt": "2026-02-16T12:00:00Z",
    "updatedAt": "2026-02-16T14:30:00Z"
  }
}
```

### POST /api/tasks

创建任务（进入 draft 状态）。

请求：
```json
{
  "teamId": "team001",
  "description": "帮我分析2025年Q4的市场趋势，生成一份分析报告",
  "mode": "suggest"
}
```

校验规则：
- `teamId`：必填，必须引用已存在的团队，否则返回 `NOT_FOUND`
- `description`：必填，1-5000 字符
- `mode`：可选，`suggest`（默认）或 `auto`。`suggest` 模式下每个阶段需用户审批，`auto` 模式下 PM 自动推进（MVP 阶段仅实现 `suggest`）
- 校验失败返回 `VALIDATION_ERROR`

响应：创建后的完整任务对象。

```json
{
  "data": {
    "id": "task001",
    "teamId": "team001",
    "teamName": "数据分析团队",
    "title": null,
    "description": "帮我分析2025年Q4的市场趋势，生成一份分析报告",
    "status": "draft",
    "mode": "suggest",
    "brief": null,
    "teamConfig": null,
    "plan": null,
    "subtasks": [],
    "createdAt": "2026-02-16T12:00:00Z",
    "updatedAt": "2026-02-16T12:00:00Z"
  }
}
```

### POST /api/tasks/:id/chat

与 PM 对话（需求对齐阶段 + 任务书生成）。

请求：
```json
{
  "message": "重点关注科技行业"
}
```

实现逻辑：
1. 任务状态自动从 `draft` 转为 `aligning`（首次对话时）
2. 加载团队 PM 员工配置
3. 创建 PM AgentRunner（来自 `@agentcorp/agent-core`），注入 PM 元工具：
   - PM 的 system_prompt + 任务对齐指令
   - `generate_brief` 工具（AI SDK tool + Zod 定义，execute 中触发状态变更）
   - 历史对话消息
4. AI SDK `streamText` 自动处理对话和工具调用
5. 当 PM 调用 `generate_brief` 时，execute 函数将任务书存入数据库，状态转为 `brief_review`

   ```typescript
   import { AgentRunner, createModel, createPMTools } from '@agentcorp/agent-core';

   // 持久化用户消息
   await db.insert(taskMessages).values({
     taskId, role: 'user', content: message, messageType: 'chat',
   });
   // 预插入 assistant 占位记录，获取 ID（done.messageId 指向 assistant 消息）
   const assistantMsg = await db.insert(taskMessages).values({
     taskId, role: 'assistant', senderId: pmEmployeeId, content: '', messageType: 'chat',
   }).returning();

   const model = createModel(pmModelConfig);
   const pmTools = createPMTools({
     onGenerateBrief: async (brief) => {
       await db.update(tasks).set({ brief, status: 'brief_review' }).where(eq(tasks.id, taskId));
       sendSSE('status_change', { status: 'brief_review', brief });
     },
     // ... 其他 handler
   });

   const runner = new AgentRunner({
     model,
     systemPrompt: pmSystemPrompt + alignmentInstructions,
     mcpToolConfigs: [],  // PM 对齐阶段不需要 MCP 工具
     internalTools: pmTools,
     assistantMessageId: assistantMsg.id,
   });

   runner.loadMessages(historyMessages);
   await runner.run(message, streamCallbacks);
   ```

PM 元工具定义（AI SDK tool + Zod，详见 [agent-core.md](agent-core.md)）：

```typescript
generate_brief: tool({
  description: '当需求已充分对齐时，生成结构化任务书',
  inputSchema: z.object({
    title: z.string().describe('任务标题'),
    objective: z.string().describe('任务目标'),
    deliverables: z.string().describe('交付物定义'),
    constraints: z.string().optional().describe('约束条件'),
    acceptanceCriteria: z.string().describe('验收标准'),
  }),
  execute: async (brief) => { /* 存入数据库，触发状态变更 */ },
})
```

响应：SSE 流（所有事件携带 seq，详见 [sse.md](sse.md)）

```
event: delta
data: {"seq":1,"content":"好的，让我确认一下..."}

event: status_change
data: {"seq":2,"status":"brief_review","brief":{"title":"...","objective":"..."}}

event: done
data: {"seq":3,"totalSeq":3,"messageId":"msg_xxx","finishReason":"stop","usage":{"inputTokens":800,"outputTokens":150},"toolCallCount":0}
```

### POST /api/tasks/:id/approve-brief

用户审批任务书。

前置条件：任务状态必须为 `brief_review`，否则返回 `INVALID_STATE` 错误。

请求：
```json
{
  "approved": true,
  "modifications": {}
}
```

或拒绝并修改：
```json
{
  "approved": false,
  "modifications": {
    "objective": "修改后的目标..."
  }
}
```

审批通过后（同步操作，API 阻塞直到 PM 完成推荐，超时 60s）：
1. PM 自动推荐参与本次任务的员工（从团队成员中选择）
2. PM 为每个参与员工生成任务上下文提示词
3. 状态转为 `team_review`
4. 响应中包含 PM 推荐的 teamConfig
5. 超时（60s）或 LLM 调用失败时返回 `LLM_ERROR`，任务状态保持 `brief_review` 不变，用户可重试

响应（通过）：
```json
{
  "data": {
    "id": "task001",
    "status": "team_review",
    "brief": { "title": "Q4市场分析报告", "objective": "...", "deliverables": "...", "constraints": "...", "acceptanceCriteria": "..." },
    "teamConfig": {
      "pm": { "id": "emp001", "name": "分析经理" },
      "members": [
        { "id": "emp002", "name": "数据采集员", "taskPrompt": "负责从公开数据源采集Q4市场数据..." }
      ]
    },
    "updatedAt": "2026-02-16T14:30:00Z"
  }
}
```

拒绝后：状态回退为 `aligning`，用户可继续与 PM 对话修改任务书。

响应（拒绝）：
```json
{
  "data": {
    "id": "task001",
    "status": "aligning",
    "brief": { "title": "Q4市场分析报告", "objective": "修改后的目标...", "deliverables": "...", "constraints": "...", "acceptanceCriteria": "..." },
    "updatedAt": "2026-02-16T14:31:00Z"
  }
}
```

### POST /api/tasks/:id/approve-team

用户确认团队配置。

前置条件：任务状态必须为 `team_review`，否则返回 `INVALID_STATE` 错误。

请求：
```json
{
  "approved": true,
  "adjustments": {}
}
```

或拒绝：
```json
{
  "approved": false,
  "adjustments": {
    "addMembers": ["emp004"],
    "removeMembers": ["emp003"]
  }
}
```

确认后（同步操作，API 阻塞直到 PM 完成计划生成，超时 60s）：
1. PM 自动生成执行计划（子任务拆解、分配、依赖关系）
2. 状态转为 `plan_review`
3. 响应中包含 PM 生成的 plan
4. 超时（60s）或 LLM 调用失败时返回 `LLM_ERROR`，任务状态保持 `team_review` 不变，用户可重试

响应（通过）：
```json
{
  "data": {
    "id": "task001",
    "status": "plan_review",
    "teamConfig": {
      "pm": { "id": "emp001", "name": "分析经理" },
      "members": [
        { "id": "emp002", "name": "数据采集员", "taskPrompt": "..." }
      ]
    },
    "plan": {
      "subtasks": [
        {
          "id": "sub001",
          "title": "数据采集",
          "description": "从公开数据源采集Q4市场数据",
          "assigneeId": "emp002",
          "dependsOn": []
        }
      ]
    },
    "updatedAt": "2026-02-16T15:00:00Z"
  }
}
```

拒绝后：状态回退为 `brief_review`，用户可调整团队配置后重新确认。

响应（拒绝）：
```json
{
  "data": {
    "id": "task001",
    "status": "brief_review",
    "teamConfig": {
      "pm": { "id": "emp001", "name": "分析经理" },
      "members": [
        { "id": "emp002", "name": "数据采集员", "taskPrompt": "..." },
        { "id": "emp004", "name": "新增成员", "taskPrompt": "..." }
      ]
    },
    "updatedAt": "2026-02-16T15:01:00Z"
  }
}
```

### POST /api/tasks/:id/approve-plan

用户审批执行计划。

前置条件：任务状态必须为 `plan_review`，否则返回 `INVALID_STATE` 错误。

请求：
```json
{
  "approved": true
}
```

或拒绝：
```json
{
  "approved": false,
  "feedback": "子任务拆分粒度太粗，请细化数据采集步骤"
}
```

审批通过后（异步启动执行，立即返回）：
1. 状态转为 `executing`
2. 创建 subtasks 记录
3. 后台启动任务执行（详见 agent-core.md），通过 SSE 推送进度

响应（通过）：
```json
{
  "data": {
    "id": "task001",
    "status": "executing",
    "plan": {
      "subtasks": [
        { "id": "sub001", "title": "数据采集", "assigneeId": "emp002", "dependsOn": [] }
      ]
    },
    "subtasks": [
      { "id": "sub001", "title": "数据采集", "assigneeId": "emp002", "assigneeName": "数据采集员", "status": "pending", "dependsOn": [] }
    ],
    "updatedAt": "2026-02-16T15:30:00Z"
  }
}
```

拒绝后：状态回退为 `team_review`，PM 根据反馈重新生成计划。

响应（拒绝）：
```json
{
  "data": {
    "id": "task001",
    "status": "team_review",
    "updatedAt": "2026-02-16T15:31:00Z"
  }
}
```

### 任务完成结构

任务执行完成后（PM 调用 `complete_task` 元工具），任务状态转为 `completed`，通过 SSE `task_completed` 事件推送。GET /api/tasks/:id 返回的 `result` 字段：

注意：`complete_task` 元工具只提供 `summary` 和 `deliverables`（由 LLM 生成），`subtaskSummary` 和 `completedAt` 由服务端在 `onCompleteTask` handler 中自动计算填充。

```json
{
  "result": {
    "summary": "Q4市场分析报告已完成，涵盖科技、金融、消费三大行业",
    "deliverables": "## Q4市场分析报告\n\n### 1. 科技行业...",
    "subtaskSummary": {
      "total": 3,
      "completed": 3,
      "failed": 0
    },
    "completedAt": "2026-02-16T18:00:00Z"
  }
}
```

任务失败时（子任务多次重试仍失败），状态转为 `failed`：

```json
{
  "result": {
    "summary": "任务执行失败：数据采集子任务超时",
    "error": "子任务 sub001 执行超时（超过 300s）",
    "subtaskSummary": {
      "total": 3,
      "completed": 1,
      "failed": 1
    },
    "failedAt": "2026-02-16T16:00:00Z"
  }
}
```

### 状态转换守卫

每个状态变更端点都有前置状态检查。非法转换返回：

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "当前状态 draft 不允许执行 approve-brief 操作",
    "currentStatus": "draft",
    "requiredStatus": "brief_review",
    "action": "approve-brief"
  }
}
```

| 操作 | 要求的前置状态 | 通过后状态 | 拒绝后状态 |
|------|---------------|-----------|-----------|
| `POST /chat`（首次） | `draft` | `aligning` | — |
| `POST /chat`（后续） | `aligning` | `aligning` | — |
| `POST /chat`（其他状态） | 其他任何状态 | 返回 `INVALID_STATE`（requiredStatus: `"draft 或 aligning"`） | — |
| `approve-brief`（通过） | `brief_review` | `team_review` | — |
| `approve-brief`（拒绝） | `brief_review` | — | `aligning` |
| `approve-team`（通过） | `team_review` | `plan_review` | — |
| `approve-team`（拒绝） | `team_review` | — | `brief_review` |
| `approve-plan`（通过） | `plan_review` | `executing` | — |
| `approve-plan`（拒绝） | `plan_review` | — | `team_review` |

状态回退说明：
- `approve-brief` 拒绝 → `aligning`：用户可继续与 PM 对话修改需求，PM 重新生成任务书
- `approve-team` 拒绝 → `brief_review`：用户可调整团队配置后重新审批，PM 重新推荐
- `approve-plan` 拒绝 → `team_review`：PM 根据反馈重新生成执行计划

幂等性：对已处于目标状态的任务重复调用审批操作，返回 HTTP 200 + 当前任务完整状态（同 GET /api/tasks/:id 格式），不重复触发后续流程。

### GET /api/tasks/:id/messages

获取任务的对话消息历史。

查询参数：
- `type`（可选）：按消息类型筛选（`chat` / `brief` / `plan` / `approval` / `result`）

响应：
```json
{
  "data": [
    {
      "id": "msg001",
      "taskId": "task001",
      "role": "user",
      "senderId": null,
      "content": "帮我分析Q4市场趋势",
      "messageType": "chat",
      "metadata": null,
      "createdAt": "2026-02-16T12:00:00Z"
    },
    {
      "id": "msg002",
      "taskId": "task001",
      "role": "assistant",
      "senderId": "emp001",
      "content": "好的，让我确认一下需求...",
      "messageType": "chat",
      "metadata": null,
      "createdAt": "2026-02-16T12:00:05Z"
    }
  ]
}
```

### GET /api/tasks/:id/subtasks

获取任务的子任务列表及状态。

响应：
```json
{
  "data": [
    {
      "id": "sub001",
      "taskId": "task001",
      "title": "数据采集",
      "description": "从公开数据源采集Q4市场数据",
      "assigneeId": "emp002",
      "assigneeName": "数据采集员",
      "status": "completed",
      "dependsOn": [],
      "output": { "summary": "已采集3个数据源的Q4数据" },
      "createdAt": "2026-02-16T15:30:00Z",
      "updatedAt": "2026-02-16T16:00:00Z"
    }
  ]
}
```

### GET /api/tasks/:id/events

SSE 端点，订阅任务实时事件（详见 sse.md）。

## 前端页面

### 任务列表页 `/tasks`

- 表格展示：标题、所属团队、状态、模式、创建时间
- 状态用颜色标签区分
- 按团队/状态筛选
- 点击进入任务详情

### 任务创建 `/tasks/new`

- 选择团队（下拉）
- 输入任务描述（textarea）
- 创建后跳转到任务详情页

### 任务详情页 `/tasks/:id`

根据任务状态展示不同内容：

**aligning 状态**：
- 对话界面（与 PM 对话）
- 流式输出

**brief_review 状态**：
- 展示任务书（结构化卡片）
- 审批按钮（通过/修改/拒绝）

**team_review 状态**：
- 展示 PM 推荐的团队配置
- 每个成员卡片：头像、名称、预期职责
- 可调整（增减成员）
- 确认按钮

**plan_review 状态**：
- 展示执行计划
- 子任务列表：标题、负责人、依赖关系
- 简单的依赖关系可视化（列表+缩进，MVP 不做画布）
- 审批按钮

**executing 状态**：
- 子任务状态列表
- 每个子任务显示：标题、负责人、状态、输出摘要
- 实时更新（SSE）
- 整体进度条

**completed 状态**：
- 交付物展示
- 子任务执行摘要
