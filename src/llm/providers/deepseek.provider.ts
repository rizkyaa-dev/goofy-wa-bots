import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnv } from '../../config/env.validation';
import { GenerateReplyInput, LlmProviderOptions } from '../domain/llm.types';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

@Injectable()
export class DeepSeekProvider extends OpenAiCompatibleProvider {
  readonly name = 'deepseek';

  constructor(config: ConfigService<AppEnv, true>) {
    super(config);
  }

  getDefaultModel(): string {
    return this.config.get('DEEPSEEK_MODEL');
  }

  getDefaultOptions(): LlmProviderOptions {
    return {
      temperature: this.config.get('DEEPSEEK_TEMPERATURE'),
      maxTokens: this.config.get('DEEPSEEK_MAX_TOKENS') ?? this.config.get('LLM_MAX_TOKENS'),
      topP: this.config.get('DEEPSEEK_TOP_P'),
      reasoningEffort: this.config.get('DEEPSEEK_REASONING_EFFORT'),
      thinkingType: this.config.get('DEEPSEEK_THINKING_TYPE'),
    };
  }

  protected getBaseUrl(): string {
    return this.config.get('DEEPSEEK_BASE_URL');
  }

  protected getApiKey(): string {
    return this.config.get('DEEPSEEK_API_KEY');
  }

  protected override getExtraBody(input: GenerateReplyInput & { model: string }): Record<string, unknown> {
    if (!input.thinkingType) {
      return {};
    }

    return {
      thinking: {
        type: input.thinkingType,
      },
    };
  }
}
