import { GenerateReplyInput, GenerateReplyResult } from './llm.types';
import { LlmProviderOptions } from './llm.types';

export interface LlmProvider {
  readonly name: string;

  getDefaultModel(): string;
  getDefaultOptions(): LlmProviderOptions;
  generateReply(input: GenerateReplyInput & { model: string }): Promise<GenerateReplyResult>;
}
