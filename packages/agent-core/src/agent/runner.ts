import { streamText, stepCountIs } from 'ai';
import type { ToolSet, ModelMessage } from 'ai';
import type { AgentConfig, AgentStreamCallbacks } from './types.js';
import { MCPManager } from '../mcp/manager.js';
import { bridgeMCPTools } from '../mcp/bridge.js';

const MAX_STEPS_LIMIT = 50;

export class AgentRunner {
  private mcpManager: MCPManager;
  private config: AgentConfig;
  private messages: ModelMessage[] = [];
  private lastAssistantText: string = '';
  private initialized = false;

  constructor(config: AgentConfig) {
    this.config = config;
    this.mcpManager = new MCPManager();
  }

  async initialize(): Promise<void> {
    for (const toolConfig of this.config.mcpToolConfigs) {
      try {
        await this.mcpManager.connect(toolConfig);
      } catch (err) {
        console.warn(`MCP tool "${toolConfig.name}" failed to connect, skipping:`, (err as Error).message);
      }
    }
    this.initialized = true;
  }

  loadMessages(messages: ModelMessage[]): void {
    this.messages = [...messages];
  }

  getLastAssistantText(): string {
    return this.lastAssistantText;
  }

  async run(userMessage: string, callbacks: AgentStreamCallbacks): Promise<void> {
    if (!this.initialized) {
      throw new Error('AgentRunner.initialize() must be called before run()');
    }

    this.messages.push({ role: 'user', content: [{ type: 'text', text: userMessage }] });

    // Merge MCP tools and internal tools
    const mcpTools = bridgeMCPTools(this.mcpManager);
    const allTools: ToolSet = { ...mcpTools };
    if (this.config.internalTools) {
      for (const [name, t] of Object.entries(this.config.internalTools)) {
        if (mcpTools[name]) {
          console.warn(`Internal tool "${name}" overrides MCP tool with same name`);
        }
        allTools[name] = t;
      }
    }

    const maxSteps = Math.min(Math.max(this.config.maxSteps || 20, 1), MAX_STEPS_LIMIT);

    try {
      const result = streamText({
        model: this.config.model as any, // AI SDK v5 type workaround
        system: this.config.systemPrompt,
        messages: this.messages,
        tools: Object.keys(allTools).length > 0 ? allTools : undefined,
        stopWhen: stepCountIs(maxSteps),
        onStepFinish: async ({ usage }) => {
          callbacks.onStepFinish({
            usage: {
              inputTokens: usage.inputTokens ?? 0,
              outputTokens: usage.outputTokens ?? 0,
            },
          });
        },
      });

      // Consume stream events
      let fullText = '';
      for await (const chunk of result.fullStream) {
        switch (chunk.type) {
          case 'text-delta':
            fullText += chunk.text;
            callbacks.onTextDelta(chunk.text);
            break;
          case 'tool-call':
            callbacks.onToolCall(chunk.toolCallId, chunk.toolName, chunk.input);
            break;
          case 'tool-result':
            callbacks.onToolResult(
              chunk.toolCallId,
              chunk.toolName,
              chunk.output,
              (chunk as any).isError ?? false,
            );
            break;
          case 'error':
            callbacks.onError(new Error(String(chunk.error)));
            break;
        }
      }

      // Append response messages to history
      const response = await result.response;
      this.messages.push(...(response.messages as ModelMessage[]));

      const messageId = this.config.assistantMessageId || null;
      const finishReason = (await result.finishReason) || 'stop';
      this.lastAssistantText = fullText;
      await callbacks.onFinish({ text: fullText, messageId, finishReason });
    } catch (err) {
      // Dual channel: callbacks ensure SSE stream ends properly, re-throw for caller
      const error = err instanceof Error ? err : new Error(String(err));
      callbacks.onError(error);
      await callbacks.onFinish({ text: '', messageId: null, finishReason: 'error' });
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    await this.mcpManager.closeAll();
    this.initialized = false;
  }
}
