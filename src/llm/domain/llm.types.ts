export type LlmRole = 'system' | 'user' | 'assistant';

export type LlmMessage = {
  role: LlmRole;
  content: string;
};

export type LlmReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export type LlmThinkingType = 'enabled' | 'disabled';

export type LlmProviderOptions = {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  reasoningEffort?: LlmReasoningEffort;
  thinkingType?: LlmThinkingType;
};

export type GenerateReplyInput = {
  messages: LlmMessage[];
  providerName?: string | null;
  model?: string | null;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  reasoningEffort?: LlmReasoningEffort;
  thinkingType?: LlmThinkingType;
};

export type GenerateReplyResult = {
  text: string;
  provider: string;
  model: string;
};
