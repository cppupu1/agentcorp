# Agent 核心框架

对应实现：`packages/agent-core`

## 概述

agent-core 基于 Vercel AI SDK (`ai` v5) 构建，利用其内置的 streaming + tool loop 能力，自研部分聚焦于 MCP 桥接和 PM 编排逻辑。

核心能力：

1. **LLM Provider 工厂** — 基于 AI SDK 的 `createOpenAI` 动态创建 Provider
2. **MCP 客户端** — MCP Server 进程管理，将 MCP 工具桥接为 AI SDK tool 格式
3. **Agent 运行时** — 基于 AI SDK `streamText` + `stopWhen` 的 Agent 循环
4. **PM 编排** — PM 通过内部工具（元工具）编排团队成员

## 模块结构

```
packages/agent-core/src/
├── llm/
│   ├── provider-factory.ts   # LLM Provider 工厂
│   └── types.ts              # 模型配置类型
├── mcp/
│   ├── manager.ts            # MCP Server 进程管理器
│   ├── bridge.ts             # MCP → AI SDK tool 桥接
│   └── types.ts              # MCP 相关类型
├── agent/
│   ├── runner.ts             # Agent 运行时（基于 streamText）
│   ├── pm-runner.ts          # PM Agent 运行时（编排逻辑）
│   └── types.ts              # Agent 相关类型
└── index.ts                  # 统一导出
```

## 1. LLM Provider 工厂 (`llm/provider-factory.ts`)

根据数据库中的模型配置，动态创建 AI SDK Provider 实例。

```typescript
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV1 } from 'ai';

interface ModelConfig {
  apiKey: string;
  baseURL: string;
  modelId: string;
}

// 根据模型配置创建 AI SDK LanguageModel
function createModel(config: ModelConfig): LanguageModelV1 {
  const provider = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });
  return provider(config.modelId);
}
```

设计说明：
- MVP 阶段统一使用 `@ai-sdk/openai`（兼容所有 OpenAI 格式 API）
- 后续可根据 `baseURL` 自动识别 Provider 类型，切换到 `@ai-sdk/anthropic` 等原生 Provider
- Provider 实例不缓存，每次 Agent 运行时按需创建（模型配置可能随时变更）

## 2. MCP 客户端 (`mcp/manager.ts` + `mcp/bridge.ts`)

### 进程管理器 (`manager.ts`)

管理多个 MCP Server 进程的生命周期。

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface MCPToolConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  envVars: Record<string, string>;
}

interface MCPConnection {
  config: MCPToolConfig;
  client: Client;
  transport: StdioClientTransport;
  mcpTools: MCPToolInfo[];  // MCP 原始工具信息
}

class MCPManager {
  private connections: Map<string, MCPConnection> = new Map();

  // 启动 MCP Server 并获取工具列表
  async connect(config: MCPToolConfig): Promise<void> {
    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['-y', config.command, ...config.args],
      env: { ...process.env, ...config.envVars },
    });

    const client = new Client({
      name: 'agentcorp',
      version: '1.0.0',
    });

    await client.connect(transport);
    const { tools } = await client.listTools();

    this.connections.set(config.id, {
      config,
      client,
      transport,
      mcpTools: tools,
    });
  }

  // 调用 MCP 工具
  async callTool(configId: string, toolName: string, args: Record<string, unknown>): Promise<string> {
    const conn = this.connections.get(configId);
    if (!conn) throw new Error(`MCP connection not found: ${configId}`);

    const result = await conn.client.callTool({
      name: toolName,
      arguments: args,
    });

    return JSON.stringify(result.content);
  }

  // 获取所有连接的 MCP 工具原始信息
  getAllMCPTools(): Array<{ configId: string; tools: MCPToolInfo[] }> {
    return Array.from(this.connections.entries()).map(([id, conn]) => ({
      configId: id,
      tools: conn.mcpTools,
    }));
  }

  async closeAll(): Promise<void> {
    for (const conn of this.connections.values()) {
      await conn.client.close();
    }
    this.connections.clear();
  }
}
```

### MCP → AI SDK 工具桥接 (`bridge.ts`)

将 MCP 工具转换为 AI SDK 的 `tool()` 格式，关键在于将 MCP 的 JSON Schema 转为 Zod schema，并将 `execute` 函数桥接到 MCPManager。

```typescript
import { tool } from 'ai';
import { jsonSchema } from 'ai';
import type { ToolSet } from 'ai';

// 将 MCPManager 中的所有工具桥接为 AI SDK ToolSet
function bridgeMCPTools(mcpManager: MCPManager): ToolSet {
  const tools: ToolSet = {};

  for (const { configId, tools: mcpTools } of mcpManager.getAllMCPTools()) {
    for (const mcpTool of mcpTools) {
      const toolName = `${configId}__${mcpTool.name}`;

      tools[toolName] = tool({
        description: mcpTool.description || '',
        inputSchema: jsonSchema(mcpTool.inputSchema || { type: 'object', properties: {} }),
        execute: async (args) => {
          return await mcpManager.callTool(configId, mcpTool.name, args);
        },
      });
    }
  }

  return tools;
}
```

设计说明：
- 使用 AI SDK 的 `jsonSchema()` 直接包装 MCP 的 JSON Schema，无需手动转 Zod
- 工具名前缀 `{configId}__` 避免不同 MCP Server 的工具名冲突
- `execute` 函数桥接到 MCPManager，AI SDK 的 tool loop 会自动调用

## 3. Agent 运行时 (`agent/runner.ts`)

基于 AI SDK `streamText` 的 Agent 运行时。AI SDK 内置了 tool loop，不需要手动实现循环。

```typescript
import { streamText, stepCountIs, type ToolSet, type ModelMessage } from 'ai';
import type { LanguageModelV1 } from 'ai';

interface AgentConfig {
  model: LanguageModelV1;
  systemPrompt: string;
  mcpToolConfigs: MCPToolConfig[];  // MCP 工具配置
  internalTools?: ToolSet;          // 内部工具（如 PM 的元工具）
  maxSteps?: number;                // 最大工具调用轮次，默认 20
  assistantMessageId?: string;      // 由调用方预生成的 assistant 消息持久化 ID
}

interface AgentStreamCallbacks {
  onTextDelta: (text: string) => void;
  onToolCall: (id: string, toolName: string, args: unknown) => void;
  onToolResult: (id: string, toolName: string, result: unknown, isError: boolean) => void;
  onStepFinish: (info: { usage: { inputTokens: number; outputTokens: number } }) => void;
  onFinish: (info: { text: string; messageId: string | null; finishReason: string }) => void;
  onError: (error: Error) => void;
}

class AgentRunner {
  private mcpManager: MCPManager;
  private config: AgentConfig;
  private messages: ModelMessage[] = [];
  private lastAssistantText: string = '';

  constructor(config: AgentConfig) {
    this.config = config;
    this.mcpManager = new MCPManager();
  }

  async initialize(): Promise<void> {
    // 启动所有 MCP Server
    for (const toolConfig of this.config.mcpToolConfigs) {
      await this.mcpManager.connect(toolConfig);
    }
  }

  // 加载历史消息（用于多轮对话场景）
  loadMessages(messages: ModelMessage[]): void {
    this.messages = [...messages];
  }

  // 获取最后一次 run 的助手回复文本
  getLastAssistantText(): string {
    return this.lastAssistantText;
  }

  async run(userMessage: string, callbacks: AgentStreamCallbacks): Promise<void> {
    this.messages.push({ role: 'user', content: userMessage });

    // 合并 MCP 工具和内部工具
    const mcpTools = bridgeMCPTools(this.mcpManager);
    const allTools: ToolSet = {
      ...mcpTools,
      ...(this.config.internalTools || {}),
    };

    try {
      const result = streamText({
        model: this.config.model,
        system: this.config.systemPrompt,
        messages: this.messages,
        tools: Object.keys(allTools).length > 0 ? allTools : undefined,
        stopWhen: stepCountIs(this.config.maxSteps || 20),
        onStepFinish: async ({ usage, toolCalls }) => {
          callbacks.onStepFinish({ usage });
        },
      });

      // 消费流式事件
      let fullText = '';
      for await (const chunk of result.fullStream) {
        switch (chunk.type) {
          case 'text-delta':
            fullText += chunk.text;
            callbacks.onTextDelta(chunk.text);
            break;
          case 'tool-call':
            // AI SDK v5 使用 `input` 字段名，SSE 层转换为 `arguments` 输出
            callbacks.onToolCall(chunk.toolCallId, chunk.toolName, chunk.input);
            break;
          case 'tool-result':
            callbacks.onToolResult(chunk.toolCallId, chunk.toolName, chunk.output, chunk.isError ?? false);
            break;
          case 'error':
            callbacks.onError(new Error(String(chunk.error)));
            break;
        }
      }

      // 将 LLM 响应消息追加到历史
      const response = await result.response;
      this.messages.push(...response.messages);

      // assistantMessageId 由调用方（路由层）预生成并传入
      // 路由层负责：1) 预插入 assistant 占位记录获取 ID  2) 传入 AgentRunner  3) run 完成后回填内容
      // 这样 done.messageId 始终指向 assistant 消息，可直接用于查询验证
      const messageId = this.config.assistantMessageId || null;
      const finishReason = (await result.finishReason) || 'stop';
      this.lastAssistantText = fullText;
      callbacks.onFinish({ text: fullText, messageId, finishReason });
    } catch (err) {
      // 双通道：回调保证 SSE 流正常结束，re-throw 让调用方知道失败
      const error = err instanceof Error ? err : new Error(String(err));
      callbacks.onError(error);
      callbacks.onFinish({ text: '', messageId: null, finishReason: 'error' });
      throw error;  // 调用方（如 executeSubtask）通过 try/catch 捕获，避免"假通过"
    }
  }

  async cleanup(): Promise<void> {
    await this.mcpManager.closeAll();
  }
}
```

与之前方案的对比：
- 不再需要手动实现 while 循环和 tool_calls 检测
- 不再需要手动拼接 streaming 中的 tool_call 参数增量
- `streamText` + `stopWhen` 自动处理多轮工具调用
- `fullStream` 提供结构化事件，直接 switch/case 消费

## 4. PM Agent 运行时 (`agent/pm-runner.ts`)

PM Agent 在 AgentRunner 基础上增加编排能力。PM 的"元工具"用 AI SDK 的 `tool()` + Zod 定义。

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import type { ToolSet } from 'ai';

// PM 的内部工具（元工具）
function createPMTools(handlers: PMToolHandlers): ToolSet {
  return {
    generate_brief: tool({
      description: '当需求已充分对齐时，生成结构化任务书',
      inputSchema: z.object({
        title: z.string().describe('任务标题'),
        objective: z.string().describe('任务目标'),
        deliverables: z.string().describe('交付物定义'),
        constraints: z.string().optional().describe('约束条件'),
        acceptanceCriteria: z.string().describe('验收标准'),
      }),
      execute: async (brief) => {
        await handlers.onGenerateBrief(brief);
        return '任务书已生成，等待用户审批。';
      },
    }),

    generate_plan: tool({
      description: '生成执行计划，将任务拆解为子任务',
      inputSchema: z.object({
        subtasks: z.array(z.object({
          title: z.string(),
          description: z.string(),
          assigneeId: z.string().describe('负责员工 ID'),
          dependsOn: z.array(z.string()).optional().describe('依赖的子任务 ID'),
        })),
      }),
      execute: async (plan) => {
        await handlers.onGeneratePlan(plan);
        return '执行计划已生成，等待用户审批。';
      },
    }),

    assign_subtask: tool({
      description: '将子任务分配给团队成员执行',
      inputSchema: z.object({
        subtaskId: z.string(),
        employeeId: z.string(),
        instruction: z.string().describe('给员工的具体指令和上下文'),
      }),
      execute: async ({ subtaskId, employeeId, instruction }) => {
        const result = await handlers.onAssignSubtask(subtaskId, employeeId, instruction);
        return result;  // 返回员工执行结果
      },
    }),

    complete_task: tool({
      description: '标记任务完成并生成最终交付物',
      inputSchema: z.object({
        summary: z.string().describe('任务总结'),
        deliverables: z.string().describe('交付物内容'),
      }),
      execute: async (result) => {
        await handlers.onCompleteTask(result);
        return '任务已完成。';
      },
    }),
  };
}

interface PMToolHandlers {
  onGenerateBrief: (brief: Brief) => Promise<void>;
  onGeneratePlan: (plan: Plan) => Promise<void>;
  onAssignSubtask: (subtaskId: string, employeeId: string, instruction: string) => Promise<string>;
  onCompleteTask: (result: TaskResult) => Promise<void>;
}
```

### PM 编排流程

**需求对齐阶段**：
1. PM 使用普通对话能力与用户交互
2. 当 PM 认为需求已充分对齐，AI SDK 自动调用 `generate_brief` 工具
3. `execute` 函数中触发 handler，将任务书存入数据库，状态转为 `brief_review`

**执行阶段**：
1. PM 根据执行计划，AI SDK 自动调用 `assign_subtask`
2. `execute` 函数中启动对应员工的 AgentRunner 执行子任务
3. 员工执行结果作为 `assign_subtask` 的返回值，AI SDK 自动将其作为 tool_result 传回 PM
4. PM 审查结果，决定下一步（继续分配、重试、调整计划）
5. 所有子任务完成后，PM 调用 `complete_task` 生成最终交付物

### 员工执行子任务

```typescript
async function executeSubtask(
  employee: EmployeeConfig,
  subtask: SubtaskConfig,
  teamTools: MCPToolConfig[],
  callbacks: AgentStreamCallbacks
): Promise<string> {
  // 构建员工的上下文
  const systemPrompt = [
    employee.systemPrompt,
    '\n---\n',
    '当前任务上下文：',
    subtask.instruction,
  ].join('\n');

  // 员工只能使用团队授权的工具中，自己被分配的工具
  const availableTools = teamTools.filter(t =>
    employee.toolIds.includes(t.id)
  );

  const model = createModel(employee.modelConfig);

  const runner = new AgentRunner({
    model,
    systemPrompt,
    mcpToolConfigs: availableTools,
    maxSteps: 10,
  });

  await runner.initialize();

  try {
    await runner.run(subtask.instruction, callbacks);
    // 从 runner 获取最终文本
    return runner.getLastAssistantText();
  } catch (err) {
    // AgentRunner.run() 失败时会先调 onError+onFinish（SSE 正常结束），然后 re-throw
    // 这里捕获后返回错误信息给 PM，PM 决定是否重试
    return `[子任务执行失败] ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    await runner.cleanup();
  }
}
```

## 关键设计决策

1. **AI SDK 内置 tool loop**：不再手动实现 while 循环，`streamText` + `stopWhen: stepCountIs(N)` 自动处理多轮工具调用
2. **MCP → AI SDK 桥接**：通过 `jsonSchema()` 包装 MCP 的 JSON Schema，`execute` 函数桥接到 MCPManager，对 AI SDK 透明
3. **PM 元工具用 Zod 定义**：类型安全，`execute` 函数中直接触发编排逻辑（启动员工 Agent、更新数据库等）
4. **工具名前缀隔离**：不同 MCP Server 的工具通过 `{configId}__` 前缀区分
5. **进程生命周期**：MCP Server 进程在 Agent 初始化时启动，cleanup 时关闭
6. **消息隔离**：每个员工有独立的消息上下文，不共享其他员工的对话历史
