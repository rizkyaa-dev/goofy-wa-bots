import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnv } from '../../config/env.validation';
import { LlmProviderError } from '../errors/llm-provider.error';
import { LlmProvider } from '../domain/llm-provider.interface';
import { GenerateReplyInput, GenerateReplyResult, LlmMessage, LlmProviderOptions } from '../domain/llm.types';

type GeminiPart = {
  text: string;
};

type GeminiContent = {
  role?: 'user' | 'model';
  parts: GeminiPart[];
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: {
    message?: string;
  };
};

@Injectable()
export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini';

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  getDefaultModel(): string {
    return this.config.get('GEMINI_MODEL');
  }

  getDefaultOptions(): LlmProviderOptions {
    return {
      temperature: this.config.get('GEMINI_TEMPERATURE'),
      maxTokens: this.config.get('GEMINI_MAX_TOKENS') ?? this.config.get('LLM_MAX_TOKENS'),
      topP: this.config.get('GEMINI_TOP_P'),
    };
  }

  async generateReply(input: GenerateReplyInput & { model: string }): Promise<GenerateReplyResult> {
    const apiKey = this.config.get('GEMINI_API_KEY').trim();

    if (!apiKey) {
      throw new LlmProviderError('GEMINI_API_KEY belum diisi.', this.name);
    }

    const payload = this.createPayload(input);
    const url = `${this.config.get('GEMINI_BASE_URL')}/v1beta/models/${input.model}:generateContent`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json().catch(() => ({}))) as GeminiResponse;

    if (!response.ok) {
      throw new LlmProviderError(data.error?.message ?? `Gemini request failed with HTTP ${response.status}.`, this.name);
    }

    const text = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join('')
      .trim();

    if (!text) {
      throw new LlmProviderError('Gemini tidak mengembalikan teks.', this.name);
    }

    return {
      text,
      provider: this.name,
      model: input.model,
      usage: {
        inputTokens: data.usageMetadata?.promptTokenCount,
        outputTokens: data.usageMetadata?.candidatesTokenCount,
        totalTokens: data.usageMetadata?.totalTokenCount,
      },
    };
  }

  private createPayload(input: GenerateReplyInput & { model: string }): Record<string, unknown> {
    const systemInstruction = this.createSystemInstruction(input.messages);
    const contents = this.createContents(input.messages);

    return {
      ...(systemInstruction ? { system_instruction: systemInstruction } : {}),
      contents,
      generationConfig: {
        ...(typeof input.temperature === 'number' ? { temperature: input.temperature } : {}),
        ...(typeof input.maxTokens === 'number' ? { maxOutputTokens: input.maxTokens } : {}),
        ...(typeof input.topP === 'number' ? { topP: input.topP } : {}),
      },
    };
  }

  private createSystemInstruction(messages: LlmMessage[]): { parts: GeminiPart[] } | null {
    const text = messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n')
      .trim();

    return text ? { parts: [{ text }] } : null;
  }

  private createContents(messages: LlmMessage[]): GeminiContent[] {
    const contents: GeminiContent[] = messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      }));

    if (contents.length > 0) {
      return contents;
    }

    return [{ role: 'user', parts: [{ text: 'Halo' }] }];
  }
}
