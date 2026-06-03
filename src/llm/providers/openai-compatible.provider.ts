import { ConfigService } from '@nestjs/config';
import { AppEnv } from '../../config/env.validation';
import { LlmProvider } from '../domain/llm-provider.interface';
import { GenerateReplyInput, GenerateReplyResult, LlmProviderOptions } from '../domain/llm.types';
import { LlmProviderError } from '../errors/llm-provider.error';

type OpenAiCompatibleResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

export abstract class OpenAiCompatibleProvider implements LlmProvider {
  abstract readonly name: string;

  protected constructor(protected readonly config: ConfigService<AppEnv, true>) {}

  abstract getDefaultModel(): string;
  abstract getDefaultOptions(): LlmProviderOptions;

  protected abstract getBaseUrl(): string;
  protected abstract getApiKey(): string;

  async generateReply(input: GenerateReplyInput & { model: string }): Promise<GenerateReplyResult> {
    const baseUrl = this.getBaseUrl().replace(/\/$/, '');
    const apiKey = this.getApiKey().trim();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
        ...(typeof input.maxTokens === 'number' ? { max_tokens: input.maxTokens } : {}),
        ...(typeof input.topP === 'number' ? { top_p: input.topP } : {}),
        ...(input.reasoningEffort ? { reasoning_effort: input.reasoningEffort } : {}),
        ...this.getExtraBody(input),
      }),
    });

    const data = (await response.json().catch(() => ({}))) as OpenAiCompatibleResponse;

    if (!response.ok) {
      throw new LlmProviderError(data.error?.message ?? `${this.name} request failed with HTTP ${response.status}.`, this.name);
    }

    const text = data.choices?.[0]?.message?.content?.trim();

    if (!text) {
      throw new LlmProviderError(`${this.name} tidak mengembalikan teks.`, this.name);
    }

    return {
      text,
      provider: this.name,
      model: input.model,
    };
  }

  protected getExtraBody(_input: GenerateReplyInput & { model: string }): Record<string, unknown> {
    return {};
  }
}
