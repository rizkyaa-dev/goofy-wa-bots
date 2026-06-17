import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AsyncLocalStorage } from 'async_hooks';
import { AppEnv } from '../config/env.validation';
import { LlmProvider } from './domain/llm-provider.interface';
import { GenerateReplyInput, GenerateReplyResult, LlmTokenUsage } from './domain/llm.types';
import { LlmProviderError } from './errors/llm-provider.error';
import { DeepSeekProvider } from './providers/deepseek.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { OpenAiProvider } from './providers/openai.provider';

@Injectable()
export class LlmService {
  private readonly providers: ReadonlyMap<string, LlmProvider>;
  private readonly usageStorage = new AsyncLocalStorage<LlmUsageAccumulator>();

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

    const result = await provider.generateReply({
      ...input,
      providerName,
      model: input.model?.trim() || provider.getDefaultModel(),
      temperature: input.temperature ?? defaultOptions.temperature,
      maxTokens: input.maxTokens ?? defaultOptions.maxTokens,
      topP: input.topP ?? defaultOptions.topP,
      reasoningEffort: input.reasoningEffort ?? defaultOptions.reasoningEffort,
      thinkingType: input.thinkingType ?? defaultOptions.thinkingType,
    });

    this.recordUsage(result.usage);

    return result;
  }

  async runWithUsage<T>(fn: () => Promise<T>): Promise<{ result: T; usage?: LlmTokenUsage }> {
    const accumulator: LlmUsageAccumulator = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      hasUsage: false,
    };

    const result = await this.usageStorage.run(accumulator, fn);

    return {
      result,
      usage: accumulator.hasUsage
        ? {
            inputTokens: accumulator.inputTokens,
            outputTokens: accumulator.outputTokens,
            totalTokens: accumulator.totalTokens,
          }
        : undefined,
    };
  }

  private normalizeProviderName(providerName: string): string {
    return providerName.trim().toLowerCase();
  }

  private recordUsage(usage: LlmTokenUsage | undefined): void {
    const accumulator = this.usageStorage.getStore();

    if (!accumulator || !usage) {
      return;
    }

    const inputTokens = this.normalizeTokenCount(usage.inputTokens);
    const outputTokens = this.normalizeTokenCount(usage.outputTokens);
    const totalTokens = this.normalizeTokenCount(usage.totalTokens);

    if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) {
      return;
    }

    accumulator.hasUsage = true;
    accumulator.inputTokens += inputTokens ?? 0;
    accumulator.outputTokens += outputTokens ?? 0;
    accumulator.totalTokens += totalTokens ?? (inputTokens ?? 0) + (outputTokens ?? 0);
  }

  private normalizeTokenCount(value: number | undefined): number | undefined {
    return Number.isFinite(value) ? Math.max(0, Math.round(value as number)) : undefined;
  }
}

type LlmUsageAccumulator = Required<LlmTokenUsage> & {
  hasUsage: boolean;
};
