# AgentCorp MVP 技术设计文档

本文档为总览，各模块详细设计见 `docs/design/` 目录。

## 一、技术选型

| 层级 | 技术 | 说明 |
|------|------|------|
| 运行时 | Node.js v22 + TypeScript 5.x | 全栈统一语言 |
| 包管理 | npm 10.9 + npm workspaces | monorepo 管理 |
| 后端框架 | Fastify 5.x | 高性能，原生 TypeScript 支持 |
| 数据库 | SQLite (better-sqlite3) | 零运维，单文件部署 |
| ORM | Drizzle ORM | 类型安全，轻量，支持 SQLite |
| 前端框架 | React 19 + Vite 6 | 快速开发，HMR |
| UI组件 | shadcn/ui + Tailwind CSS 4 | 可定制，现代设计 |
| 前端路由 | React Router 7 | SPA 路由 |
| HTTP通信 | REST API (fetch) | 前端只负责展示，后端处理业务逻辑 |
| 实时推送 | SSE (Server-Sent Events) | 任务状态、对话流式输出 |
| LLM框架 | ai (Vercel AI SDK v5) + @ai-sdk/openai | 统一 Provider 抽象、内置 streaming + tool loop |
| MCP通信 | @modelcontextprotocol/sdk | 官方 MCP SDK，stdio JSON-RPC |

### LLM 框架选型说明

选择 Vercel AI SDK (`ai` v5 + `@ai-sdk/openai`) 作为 LLM 框架：

- 统一 Provider 抽象：通过 `@ai-sdk/openai` 兼容所有 OpenAI 格式 API，同时支持 `@ai-sdk/anthropic`、`@ai-sdk/google` 等原生 Provider
- 内置 Agent 循环：`streamText` + `stopWhen: stepCountIs(N)` 自动处理"LLM → tool call → 执行 → 继续"的多轮循环，无需手动实现
- 工具定义用 Zod：类型安全，参数自动推导
- Streaming 结构化：`fullStream` 提供 `text-delta`、`tool-call`、`tool-result` 等结构化事件，无需手动拼接
- `onStepFinish` 回调：每轮工具调用结束后触发，适合日志记录和监控
- 框架无关：核心 `ai` 包不依赖 Next.js，可在 Fastify 中直接使用

调用示例：
```typescript
import { streamText, tool, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

const provider = createOpenAI({
  apiKey: model.apiKey,
  baseURL: model.baseUrl,  // 兼容任意 OpenAI 格式 API
});

const result = streamText({
  model: provider(model.modelId),
  system: employee.systemPrompt,
  messages,
  tools: {
    web_search: tool({
      description: '搜索网页',
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => { ... },
    }),
  },
  stopWhen: stepCountIs(20),
  onStepFinish: async ({ toolCalls, usage }) => {
    // 记录工具调用日志、Token 消耗等
  },
});

// 流式消费
for await (const chunk of result.fullStream) {
  switch (chunk.type) {
    case 'text-delta': /* 文本增量 */ break;
    case 'tool-call': /* 工具调用 */ break;
    case 'tool-result': /* 工具结果 */ break;
  }
}
```

### MCP SDK 选型说明

选择 `@modelcontextprotocol/sdk` 官方 SDK：

- Anthropic 官方维护，协议实现完整
- 提供 `StdioClientTransport`，通过 stdio 与 MCP Server 进程通信
- 自动处理 JSON-RPC 协议细节（初始化握手、工具发现、工具调用）
- TypeScript 类型完备

## 二、项目结构

```
AgentCorp2/
├── package.json                  # workspace root
├── packages/
│   ├── shared/                   # 共享类型与工具
│   │   ├── src/
│   │   │   ├── types/            # 共享 TypeScript 类型
│   │   │   ├── constants/        # 共享常量（状态枚举等）
│   │   │   └── utils/            # 共享工具函数
│   │   └── package.json
│   ├── db/                       # 数据库层
│   │   ├── src/
│   │   │   ├── schema/           # Drizzle schema 定义
│   │   │   ├── migrations/       # 数据库迁移文件
│   │   │   └── index.ts          # 数据库连接与导出
│   │   └── package.json
│   ├── agent-core/               # Agent 核心框架
│   │   ├── src/
│   │   │   ├── llm/              # LLM Provider 工厂（基于 AI SDK）
│   │   │   ├── mcp/              # MCP 客户端（基于官方 SDK）
│   │   │   ├── agent/            # Agent 运行时（基于 AI SDK streamText）
│   │   │   └── index.ts
│   │   └── package.json
│   ├── server/                   # 后端服务
│   │   ├── src/
│   │   │   ├── routes/           # API 路由（按模块拆分）
│   │   │   ├── services/         # 业务逻辑
│   │   │   ├── sse/              # SSE 推送管理
│   │   │   └── app.ts            # Fastify 应用入口
│   │   └── package.json
│   └── web/                      # 前端应用
│       ├── src/
│       │   ├── components/       # 通用 UI 组件
│       │   ├── pages/            # 页面（按模块拆分）
│       │   ├── hooks/            # 自定义 hooks
│       │   ├── api/              # API 调用封装
│       │   └── App.tsx
│       └── package.json
├── docs/
│   ├── PRODUCT_DESIGN.md
│   ├── TECHNICAL_DESIGN.md       # 本文件（总览）
│   └── design/                   # 模块详细设计
│       ├── database.md           # 数据库 Schema
│       ├── api-models.md         # 模型管理 API
│       ├── api-tools.md          # 工具管理 API
│       ├── api-employees.md      # 员工管理 API
│       ├── api-teams.md          # 团队管理 API
│       ├── api-tasks.md          # 任务管理 API
│       ├── agent-core.md         # Agent 核心框架
│       └── sse.md                # SSE 实时推送
└── data/                         # 运行时数据（gitignore）
    └── agentcorp.db               # SQLite 数据库文件
```

## 三、模块设计文档索引

| 文档 | 对应实现 | 说明 |
|------|----------|------|
| [database.md](design/database.md) | `packages/db` | 全部表结构、索引、Drizzle Schema |
| [api-models.md](design/api-models.md) | `packages/server/src/routes/models` | 模型 CRUD + 连通性测试 |
| [api-tools.md](design/api-tools.md) | `packages/server/src/routes/tools` | 工具 CRUD + MCP 测试 |
| [api-employees.md](design/api-employees.md) | `packages/server/src/routes/employees` | 员工 CRUD + 提示词生成 + 测试对话 |
| [api-teams.md](design/api-teams.md) | `packages/server/src/routes/teams` | 团队 CRUD + 成员管理 + 工具授权 |
| [api-tasks.md](design/api-tasks.md) | `packages/server/src/routes/tasks` | 任务全生命周期 API |
| [agent-core.md](design/agent-core.md) | `packages/agent-core` | AI SDK Provider工厂、MCP客户端、Agent运行时 |
| [sse.md](design/sse.md) | `packages/server/src/sse` | SSE 事件定义与推送机制 |

## 四、全局 API 规范

### 健康检查

`GET /api/health`

AI 或运维工具在启动服务后轮询此端点，确认服务完全就绪。

```json
{
  "status": "ok",
  "version": "1.0.0",
  "database": "connected",
  "uptime": 12345
}
```

`database` 为 `"disconnected"` 时表示数据库未就绪，不应开始测试。

### 成功响应格式

所有成功响应统一使用 `data` 包装：

```json
// 单个对象
{ "data": { "id": "xxx", ... } }

// 列表
{ "data": [ { "id": "xxx", ... }, ... ] }
```

POST/PUT 操作必须返回完整的创建/更新后对象（含 `id`、`createdAt`、`updatedAt` 等服务端生成字段），以便调用方验证写入结果。

DELETE 操作成功后返回 HTTP 200：
```json
{ "data": { "id": "被删除的资源ID" } }
```

### 错误响应格式

所有错误响应统一结构：

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "人类可读的错误描述",
    "details": [
      { "field": "modelId", "rule": "required", "message": "modelId 是必填字段" }
    ]
  }
}
```

`details` 仅在 `VALIDATION_ERROR` 时存在，列出所有校验失败的字段。

### 错误码表

| 错误码 | HTTP 状态码 | 说明 |
|--------|------------|------|
| `VALIDATION_ERROR` | 400 | 请求参数校验失败（缺失必填字段、格式错误、枚举值无效等） |
| `NOT_FOUND` | 404 | 资源不存在（模型/工具/员工/团队/任务 ID 无效） |
| `CONFLICT` | 409 | 业务冲突（删除被引用的资源、重复创建等） |
| `INVALID_STATE` | 409 | 状态机非法转换（如在 draft 状态调用 approve-brief） |
| `LLM_ERROR` | 502 | LLM 调用失败（认证错误、模型不存在、rate limit、超时等） |
| `MCP_ERROR` | 502 | MCP 工具调用失败（进程启动失败、工具执行超时等） |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

`INVALID_STATE` 错误额外包含状态信息：

```json
{
  "error": {
    "code": "INVALID_STATE",
    "message": "当前状态不允许此操作",
    "currentStatus": "draft",
    "requiredStatus": "brief_review"
  }
}
```

`CONFLICT` 错误额外包含引用信息：

```json
{
  "error": {
    "code": "CONFLICT",
    "message": "该模型被 2 个员工引用，无法删除",
    "references": [
      { "type": "employee", "id": "emp001", "name": "资深分析师" },
      { "type": "employee", "id": "emp002", "name": "数据采集员" }
    ]
  }
}
```

### 字段校验规则

| 字段类型 | 规则 |
|----------|------|
| 名称类（name） | 必填，1-100 字符 |
| 描述类（description） | 可选，最大 5000 字符 |
| URL 类（baseUrl） | 必填，合法 URL 格式 |
| API Key | 必填（创建时），更新时空字符串表示不修改 |
| 标签数组（tags） | 最多 20 个，每个标签 1-30 字符 |
| 枚举字段 | 必须为定义的枚举值之一，否则返回 VALIDATION_ERROR |

### 字段命名约定

数据库使用 `snake_case`（如 `base_url`、`created_at`），API 响应使用 `camelCase`（如 `baseUrl`、`createdAt`）。Drizzle ORM 的 column alias 自动完成映射，无需手动转换。

### 模型不可用时的行为

当员工关联的模型 `status` 为 `unavailable` 时：
- 员工测试对话（POST /api/employees/:id/chat）：返回 `LLM_ERROR`，message 为"关联模型不可用，请先测试模型连通性"
- 任务执行中子任务分配给该员工：子任务标记为 `failed`，PM 决定是否重试或重新分配
- 前端在员工卡片上显示警告标识，提示用户检查模型状态

### 子任务执行超时

每个子任务有默认 300s（5分钟）超时限制。超时后：
1. AgentRunner 强制终止（调用 cleanup）
2. 子任务状态标记为 `failed`，error 为"执行超时（300s）"
3. 通过 SSE 推送 `subtask_failed` 事件
4. PM Agent 收到失败结果，决定是否重试（最多 2 次）或跳过

### 前端可测试性约定

关键 UI 元素添加 `data-testid` 属性，便于 AI 或自动化工具定位元素：

| 元素 | data-testid 格式 | 示例 |
|------|-----------------|------|
| 列表项 | `{resource}-item-{id}` | `model-item-a1b2c3` |
| 操作按钮 | `{action}-{resource}-btn` | `create-model-btn`、`test-model-btn` |
| 表单字段 | `{resource}-{field}-input` | `model-name-input` |
| 状态标签 | `{resource}-status-{id}` | `model-status-a1b2c3` |
| 对话消息 | `chat-message-{index}` | `chat-message-0` |
| 对话输入框 | `chat-input` | `chat-input` |
| 发送按钮 | `chat-send-btn` | `chat-send-btn` |
| 审批按钮 | `approve-{stage}-btn` / `reject-{stage}-btn` | `approve-brief-btn`、`reject-plan-btn` |
| 任务状态面板 | `task-{status}-panel` | `task-aligning-panel`、`task-executing-panel` |
| 子任务项 | `subtask-item-{id}` | `subtask-item-sub001` |
| 进度条 | `task-progress` | `task-progress` |
| 错误提示 | `error-toast` | `error-toast`（内含 `error-toast-code` 和 `error-toast-message`） |
| SSE 状态指示器 | `sse-status` | `sse-status` |

## 五、实施分期

### Phase 1：项目脚手架与基础设施
- npm workspaces monorepo 初始化
- 各 package 基础配置（TypeScript、构建）
- Drizzle ORM + SQLite 连接与迁移
- Fastify 应用骨架 + CORS + 错误处理
- Vite + React + shadcn/ui 前端骨架
- 前端路由 + 布局框架

### Phase 2：CRUD 模块
- 模型管理（前后端完整闭环）
- 工具管理（前后端完整闭环）
- 员工管理（前后端完整闭环，含标签、复制）

### Phase 3：Agent 核心框架
- LLM Provider 工厂（AI SDK createOpenAI 封装，支持动态创建 Provider）
- MCP 客户端封装（进程管理、工具发现、MCP→AI SDK tool 桥接）
- Agent 运行时（基于 AI SDK streamText + stopWhen 的工具循环）

### Phase 4：员工测试对话
- 单员工对话 API（streaming SSE）
- 对话中的工具调用执行
- 前端对话 UI

### Phase 5：团队 CRUD
- 团队管理（前后端完整闭环）
- PM 指定、成员管理、工具授权

### Phase 6：任务创建流程
- 任务创建 + 状态机
- PM 对话对齐（streaming）
- 任务书生成与审批
- 团队配置确认
- 执行计划生成与审批

### Phase 7：任务执行与监控
- PM Agent 编排逻辑（子任务调度）
- 员工 Agent 执行子任务
- SSE 实时状态推送
- 前端任务监控面板

### Phase 8：集成测试与打磨
- 端到端流程验证
- 错误处理完善
- UI 打磨
