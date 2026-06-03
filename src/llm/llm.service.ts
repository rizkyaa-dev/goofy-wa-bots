import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnv } from '../config/env.validation';
import { LlmProvider } from './domain/llm-provider.interface';
import { GenerateReplyInput, GenerateReplyResult } from './domain/llm.types';
import { LlmProviderError } from './errors/llm-provider.error';
import { DeepSeekProvider } from './providers/deepseek.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenAiProvider } from './providers/openai.provider';

@Injectable()
export class LlmService {
  private readonly providers: ReadonlyMap<string, LlmProvider>;

  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    geminiProvider: GeminiProvider,
    openAiProvider: OpenAiProvider,
    deepSeekProvider: DeepSeekProvider,
  ) {
    this.providers = new Map([geminiProvider, openAiProvider, deepSeekProvider].map((provider) => [provider.name, provider]));
  }

  getSupportedProviders(): string[] {
    return Array.from(this.providers.keys()).sort();
  }

  hasProvider(providerName: string): boolean {
    return this.providers.has(this.normalizeProviderName(providerName));
  }

  async generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult> {
    const providerName = this.normalizeProviderName(input.providerName ?? this.config.get('LLM_PROVIDER'));
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new LlmProviderError(
        `LLM provider "${providerName}" belum didukung. Pilihan: ${this.getSupportedProviders().join(', ')}.`,
        providerName,
      );
    }

    const defaultOptions = provider.getDefaultOptions();

    return provider.generateReply({
      ...input,
      providerName,
      model: input.model?.trim() || provider.getDefaultModel(),
      temperature: input.temperature ?? defaultOptions.temperature,
      maxTokens: input.maxTokens ?? defaultOptions.maxTokens,
      topP: input.topP ?? defaultOptions.topP,
      reasoningEffort: input.reasoningEffort ?? defaultOptions.reasoningEffort,
      thinkingType: input.thinkingType ?? defaultOptions.thinkingType,
    });
  }

  private normalizeProviderName(providerName: string): string {
    return providerName.trim().toLowerCase();
  }
}
