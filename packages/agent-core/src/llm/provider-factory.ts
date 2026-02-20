import { createOpenAI } from '@ai-sdk/openai';
import type { ModelConfig } from './types.js';

export function createModel(config: ModelConfig) {
  if (!config.apiKey) {
    throw new Error('ModelConfig.apiKey is required');
  }
  try { new URL(config.baseURL); } catch {
    throw new Error(`Invalid ModelConfig.baseURL: ${config.baseURL}`);
  }
  const provider = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });
  // Use chat() for OpenAI-compatible endpoints (not responses API)
  return provider.chat(config.modelId);
}
