import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnv } from '../../config/env.validation';
import { WebSearchProvider } from '../domain/web-search-provider.interface';
import { WebSearchBrief, WebSearchFreshness, WebSearchInput, WebSearchSource } from '../domain/web-search.types';

type GeminiGroundedPart = {
  text?: string;
};

type GeminiGroundingChunk = {
  web?: {
    title?: string;
    uri?: string;
  };
};

type GeminiGroundingSupport = {
  groundingChunkIndices?: number[];
  segment?: {
    text?: string;
  };
};

type GeminiGroundedResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiGroundedPart[];
    };
    groundingMetadata?: {
      groundingChunks?: GeminiGroundingChunk[];
      groundingSupports?: GeminiGroundingSupport[];
      webSearchQueries?: string[];
    };
  }>;
  error?: {
    message?: string;
  };
};

type GroundedJsonAnswer = {
  answer?: string;
  facts?: string[];
  freshness?: WebSearchFreshness;
  confidence?: number;
};

@Injectable()
export class GeminiGroundedSearchProvider implements WebSearchProvider {
  readonly name = 'gemini';

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  async search(input: WebSearchInput): Promise<WebSearchBrief> {
    const apiKey = this.config.get('GEMINI_API_KEY').trim();

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY belum diisi untuk web search.');
    }

    const timeoutMs = input.timeoutMs ?? this.config.get('WEB_SEARCH_TIMEOUT_MS');
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await fetch(this.createUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        signal: abortController.signal,
        body: JSON.stringify(this.createPayload(input)),
      });
      const data = (await response.json().catch(() => ({}))) as GeminiGroundedResponse;

      if (!response.ok) {
        throw new Error(data.error?.message ?? `Gemini grounded search failed with HTTP ${response.status}.`);
      }

      return this.toBrief(input, data);
    } finally {
      clearTimeout(timeout);
    }
  }

  private createUrl(): string {
    const baseUrl = this.config.get('GEMINI_BASE_URL').replace(/\/$/u, '');
    return `${baseUrl}/v1beta/models/${this.resolveModel()}:generateContent`;
  }

  private createPayload(input: WebSearchInput): Record<string, unknown> {
    return {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: [
                'Search the web for current, factual information needed to answer this user query.',
                'Return strict JSON only with keys: answer, facts, freshness, confidence.',
                'Use Indonesian for answer and facts unless the query requires another language.',
                'Keep answer concise and practical. If values are volatile, say they are approximate.',
                `Intent: ${input.intent}`,
                `Locale: ${input.locale ?? 'id-ID'}`,
                `Timezone: ${input.timezone ?? 'Asia/Jakarta'}`,
                `Query: ${input.query}`,
              ].join('\n'),
            },
          ],
        },
      ],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 700,
      },
    };
  }

  private toBrief(input: WebSearchInput, data: GeminiGroundedResponse): WebSearchBrief {
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.map((part) => part.text ?? '').join('').trim() ?? '';
    const parsed = this.parseJsonAnswer(text);
    const answer = this.cleanText(parsed?.answer || text || 'Tidak ada hasil web search yang cukup jelas.', 1200);
    const facts = this.resolveFacts(parsed, answer);
    const sources = this.resolveSources(candidate?.groundingMetadata?.groundingChunks ?? [], input.maxSources);

    return {
      provider: this.name,
      model: this.resolveModel(),
      query: input.query,
      answer,
      facts,
      sources,
      searchedAt: new Date(),
      freshness: parsed?.freshness ?? this.inferFreshness(input.intent),
      confidence: this.clampConfidence(parsed?.confidence ?? (sources.length > 0 ? 0.78 : 0.55)),
    };
  }

  private parseJsonAnswer(text: string): GroundedJsonAnswer | null {
    const cleaned = text.trim().replace(/^```(?:json)?/iu, '').replace(/```$/iu, '').trim();

    try {
      return JSON.parse(cleaned) as GroundedJsonAnswer;
    } catch {
      return null;
    }
  }

  private resolveFacts(parsed: GroundedJsonAnswer | null, answer: string): string[] {
    if (Array.isArray(parsed?.facts) && parsed.facts.length > 0) {
      return parsed.facts.map((fact) => this.cleanText(fact, 260)).filter(Boolean).slice(0, 6);
    }

    return answer
      .split(/(?<=[.!?])\s+/u)
      .map((fact) => this.cleanText(fact, 260))
      .filter(Boolean)
      .slice(0, 4);
  }

  private resolveSources(chunks: GeminiGroundingChunk[], maxSources = this.config.get('WEB_SEARCH_MAX_SOURCES')): WebSearchSource[] {
    const seen = new Set<string>();
    const sources: WebSearchSource[] = [];

    for (const chunk of chunks) {
      const url = chunk.web?.uri?.trim();

      if (!url || seen.has(url)) {
        continue;
      }

      seen.add(url);
      sources.push({
        title: this.cleanText(chunk.web?.title || url, 120),
        url,
      });

      if (sources.length >= maxSources) {
        break;
      }
    }

    return sources;
  }

  private inferFreshness(intent: WebSearchInput['intent']): WebSearchFreshness {
    return intent === 'exchange_rate' || intent === 'weather' || intent === 'finance' ? 'realtime' : 'recent';
  }

  private resolveModel(): string {
    return this.config.get('WEB_SEARCH_MODEL') || this.config.get('GEMINI_MODEL');
  }

  private clampConfidence(value: number): number {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
  }

  private cleanText(value: string, maxLength: number): string {
    return String(value ?? '')
      .replace(/[\r\n]+/gu, ' ')
      .replace(/\s{2,}/gu, ' ')
      .trim()
      .slice(0, maxLength)
      .trim();
  }
}
