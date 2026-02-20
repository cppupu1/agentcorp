# AgentCorp

AI 员工管理平台 —— 像经营公司一样管理你的 AI 团队。

## 简介

AgentCorp 让你可以创建、配置和管理 AI "员工"，将它们组建成团队，通过多种协作模式完成复杂任务。内置 HR 助手支持对话式创建员工，无需手动填写表单。

## 核心功能

- **AI 员工管理** — 创建员工、配置模型、系统提示词和工具
- **HR 助手** — 通过对话描述需求，AI 自动生成员工配置并创建
- **团队协作** — 5 种协作模式：自由协作、流水线、辩论、投票、主从
- **任务系统** — 任务创建、计划审批、自动执行、进度追踪（SSE 实时推送）
- **工具集成** — MCP 协议工具接入（stdio/sse），员工可调用外部工具
- **知识库** — 为员工提供领域知识上下文
- **策略引擎** — 定义员工行为规范和约束
- **触发器** — 定时或事件驱动的自动任务
- **事故管理** — 异常检测、事故记录与追踪
- **紧急停止** — 一键冻结系统，暂停所有任务执行

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | React + TypeScript + Tailwind CSS + shadcn/ui |
| 后端 | Fastify + TypeScript |
| 数据库 | SQLite (better-sqlite3) + Drizzle ORM |
| AI | Vercel AI SDK + OpenAI 兼容 API |
| 工具协议 | Model Context Protocol (MCP) |
| 构建 | npm workspaces monorepo |

## 项目结构

```
packages/
├── web/          # 前端 SPA
├── server/       # 后端 API 服务
├── db/           # 数据库 schema、迁移
├── agent-core/   # AI Agent 运行时（AgentRunner、MCP 管理）
├── shared/       # 共享常量和类型
└── data/         # SQLite 数据库文件
```

## 快速开始

### 环境要求

- Node.js >= 22.0.0

### 安装与启动

```bash
# 安装依赖
npm install

# 构建所有包
npm run build

# 数据库迁移
npm run db:migrate

# 启动开发服务（前后端同时启动）
npm run dev
```

启动后访问 http://localhost:5173

### 首次使用

1. 进入「模型」页面，添加一个 AI 模型（需要 OpenAI 兼容的 API Key 和 Base URL）
2. 进入「设置」页面，配置 `hr_assistant_model_id` 指向刚添加的模型
3. 进入「HR助手」，通过对话创建你的第一个 AI 员工

## 常用命令

```bash
npm run dev           # 启动前后端开发服务
npm run dev:server    # 仅启动后端
npm run dev:web       # 仅启动前端
npm run build         # 构建所有包
npm run db:generate   # 生成数据库迁移文件
npm run db:migrate    # 执行数据库迁移
```

## 协作模式说明

| 模式 | 适用场景 |
|------|----------|
| 自由协作 | 成员独立执行各自子任务，互不依赖 |
| 流水线 | 子任务串行执行，前一步输出作为下一步输入 |
| 辩论 | 全员分析 → 交叉审查 → PM 综合结论 |
| 投票 | 全员独立出方案 → PM 统计投票选最佳 |
| 主从 | PM 拆分计划 → 成员并行执行 → PM 汇总 |

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `AGENTCORP_DB_PATH` | SQLite 数据库文件路径 | `packages/data/agentcorp.db` |

## License

MIT
