import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnv } from '../../config/env.validation';
import { LlmProviderOptions } from '../domain/llm.types';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

@Injectable()
export class OpenAiProvider extends OpenAiCompatibleProvider {
  readonly name = 'openai';

  constructor(config: ConfigService<AppEnv, true>) {
    super(config);
  }

  getDefaultModel(): string {
    return this.config.get('OPENAI_MODEL');
  }

  getDefaultOptions(): LlmProviderOptions {
    return {
      temperature: this.config.get('OPENAI_TEMPERATURE'),
      maxTokens: this.config.get('OPENAI_MAX_TOKENS') ?? this.config.get('LLM_MAX_TOKENS'),
      topP: this.config.get('OPENAI_TOP_P'),
      reasoningEffort: this.config.get('OPENAI_REASONING_EFFORT'),
    };
  }

  protected getBaseUrl(): string {
    return this.config.get('OPENAI_BASE_URL');
  }

  protected getApiKey(): string {
    return this.config.get('OPENAI_API_KEY');
  }
}
