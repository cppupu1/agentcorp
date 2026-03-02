import { streamText, stepCountIs } from 'ai';
import type { ToolSet, ModelMessage } from 'ai';
import type { AgentConfig, AgentStreamCallbacks } from './types.js';
import { MCPManager } from '../mcp/manager.js';
import { bridgeMCPTools } from '../mcp/bridge.js';

const MAX_STEPS_LIMIT = 100;
const MAX_NO_OUTPUT_RETRIES = 1;
const CLEANUP_TIMEOUT_MS = 8_000;

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

  async run(
    userMessage: string,
    callbacks: AgentStreamCallbacks,
    options?: { signal?: AbortSignal },
  ): Promise<void> {
    if (!this.initialized) {
      throw new Error('AgentRunner.initialize() must be called before run()');
    }
    if (options?.signal?.aborted) {
      throw new Error('Agent run aborted before start');
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

    const normalizeStreamError = (raw: unknown): string => {
      if (typeof raw === 'string') return raw;
      if (raw instanceof Error) return raw.message;
      if (raw && typeof raw === 'object') {
        const obj = raw as Record<string, unknown>;
        const candidates = [
          obj.message,
          (obj.error as Record<string, unknown> | undefined)?.message,
          (obj.cause as Record<string, unknown> | undefined)?.message,
        ];
        for (const c of candidates) {
          if (typeof c === 'string' && c.trim()) return c;
        }
        try { return JSON.stringify(raw); } catch { return String(raw); }
      }
      return String(raw);
    };
    const isNoOutputError = (error: Error) => /no output generated/i.test(error.message || '');
    const isRateLimitError = (error: Error) => /too many requests|rate limit|rate_limited|429/i.test(error.message || '');

    for (let attempt = 0; attempt <= MAX_NO_OUTPUT_RETRIES; attempt += 1) {
      let hadActivity = false;
      let streamErrorMessage = '';
      try {
        const result = streamText({
          model: this.config.model as any, // AI SDK v5 type workaround
          system: this.config.systemPrompt,
          messages: this.messages,
          tools: Object.keys(allTools).length > 0 ? allTools : undefined,
          abortSignal: options?.signal,
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
              hadActivity = true;
              fullText += chunk.text;
              callbacks.onTextDelta(chunk.text);
              break;
            case 'tool-call':
              hadActivity = true;
              callbacks.onToolCall(chunk.toolCallId, chunk.toolName, chunk.input);
              break;
            case 'tool-result':
              hadActivity = true;
              callbacks.onToolResult(
                chunk.toolCallId,
                chunk.toolName,
                chunk.output,
                (chunk as any).isError ?? false,
              );
              break;
            case 'error':
              streamErrorMessage = normalizeStreamError((chunk as any).error);
              callbacks.onError(new Error(streamErrorMessage));
              break;
          }
        }

        // Append response messages to history
        const response = await result.response;
        this.messages.push(...(response.messages as ModelMessage[]));

        const finishReason = (await result.finishReason) || 'stop';
        if (finishReason === 'error') {
          throw new Error(streamErrorMessage || '模型返回错误（finishReason=error）');
        }

        const messageId = this.config.assistantMessageId || null;
        this.lastAssistantText = fullText;
        await callbacks.onFinish({ text: fullText, messageId, finishReason });
        return;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const retryableNoOutput = isNoOutputError(error) && !hadActivity;
        const retryableRateLimit = isRateLimitError(error) && !hadActivity;
        const retryable = !options?.signal?.aborted
          && attempt < MAX_NO_OUTPUT_RETRIES
          && (retryableNoOutput || retryableRateLimit);
        if (retryable) {
          callbacks.onError(new Error(`模型未返回有效输出，自动重试第 ${attempt + 1} 次`));
          await new Promise(resolve => setTimeout(resolve, 800));
          continue;
        }
        // Dual channel: callbacks ensure SSE stream ends properly, re-throw for caller
        callbacks.onError(error);
        await callbacks.onFinish({ text: '', messageId: null, finishReason: 'error' });
        throw error;
      }
    }
  }

  async cleanup(): Promise<void> {
    await Promise.race([
      this.mcpManager.closeAll(),
      new Promise<void>((resolve) => setTimeout(resolve, CLEANUP_TIMEOUT_MS)),
    ]);
    this.initialized = false;
  }
}
