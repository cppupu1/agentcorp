import type { ToolSet } from 'ai';

export interface MCPToolConfig {
  id: string;
  name: string;
  transportType?: 'stdio' | 'sse';  // default 'stdio'
  command: string;                    // stdio: npm package; sse: URL
  args: string[];
  envVars: Record<string, string>;
}

export interface AgentConfig {
  model: Parameters<typeof import('ai').streamText>[0]['model'];
  systemPrompt: string;
  mcpToolConfigs: MCPToolConfig[];
  internalTools?: ToolSet;
  maxSteps?: number;
  assistantMessageId?: string;
}

export interface AgentStreamCallbacks {
  onTextDelta: (text: string) => void;
  onToolCall: (id: string, toolName: string, args: unknown) => void;
  onToolResult: (id: string, toolName: string, result: unknown, isError: boolean) => void;
  onStepFinish: (info: { usage: { inputTokens: number; outputTokens: number } }) => void;
  onFinish: (info: { text: string; messageId: string | null; finishReason: string }) => void | Promise<void>;
  onError: (error: Error) => void;
}
