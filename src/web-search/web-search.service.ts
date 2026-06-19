import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnv } from '../config/env.validation';
import { WEB_SEARCH_PROVIDER_REGISTRY, WebSearchProvider } from './domain/web-search-provider.interface';
import { WebSearchBrief, WebSearchInput, WebSearchIntent, WebSearchQualityError } from './domain/web-search.types';

type CacheEntry = {
  expiresAt: number;
  value: WebSearchBrief;
};

@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    @Inject(WEB_SEARCH_PROVIDER_REGISTRY)
    private readonly providers: WebSearchProvider[],
  ) {}

  isEnabled(): boolean {
    return this.config.get('WEB_SEARCH_ENABLED');
  }

  async search(input: WebSearchInput): Promise<WebSearchBrief | null> {
    if (!this.isEnabled()) {
      return null;
    }

    const provider = this.resolveProvider();
    const normalizedInput = {
      ...input,
      query: input.query.trim(),
      maxSources: input.maxSources ?? this.config.get('WEB_SEARCH_MAX_SOURCES'),
      timeoutMs: input.timeoutMs ?? this.config.get('WEB_SEARCH_TIMEOUT_MS'),
    };

    if (!normalizedInput.query) {
      return null;
    }

    const cacheKey = this.createCacheKey(provider.name, normalizedInput);
    const cached = this.getCached(cacheKey);

    if (cached) {
      return cached;
    }

    const result = await this.searchWithRetry(provider, normalizedInput);
    this.assertSearchQuality(normalizedInput.intent, result);
    this.setCached(cacheKey, result);
    return result;
  }

  private async searchWithRetry(provider: WebSearchProvider, input: WebSearchInput): Promise<WebSearchBrief> {
    try {
      return await provider.search(input);
    } catch (error) {
      if (!this.isAbortError(error)) {
        throw error;
      }

      this.logger.warn(`Web search timed out, retrying once: ${provider.name}|${input.intent}`);
      return provider.search(input);
    }
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof Error && (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'));
  }

  private assertSearchQuality(intent: WebSearchIntent, result: WebSearchBrief): void {
    if (!this.isCriticalIntent(intent)) {
      return;
    }

    const minConfidence = this.config.get('WEB_SEARCH_MIN_CONFIDENCE');
    const requireSources = this.config.get('WEB_SEARCH_REQUIRE_SOURCES_FOR_CRITICAL');
    const hasEnoughConfidence = result.confidence >= minConfidence;
    const hasSource = result.sources.length > 0;

    if (hasEnoughConfidence && (!requireSources || hasSource)) {
      return;
    }

    throw new WebSearchQualityError('Web search result rejected because it is not grounded enough for a critical factual answer.', {
      intent,
      provider: result.provider,
      confidence: result.confidence,
      sourceCount: result.sources.length,
    });
  }

  private isCriticalIntent(intent: WebSearchIntent): boolean {
    return intent === 'exchange_rate' || intent === 'finance';
  }

  private resolveProvider(): WebSearchProvider {
    const providerName = this.config.get('WEB_SEARCH_PROVIDER').trim().toLowerCase();
    const provider = this.providers.find((candidate) => candidate.name === providerName);

    if (!provider) {
      const supported = this.providers.map((candidate) => candidate.name).sort().join(', ');
      throw new Error(`WEB_SEARCH_PROVIDER "${providerName}" belum didukung. Pilihan: ${supported}`);
    }

    return provider;
  }

  private getCached(cacheKey: string): WebSearchBrief | null {
    const cached = this.cache.get(cacheKey);

    if (!cached) {
      return null;
    }

    if (cached.expiresAt <= Date.now()) {
      this.cache.delete(cacheKey);
      return null;
    }

    this.logger.debug(`Web search cache hit: ${cacheKey}`);
    return cached.value;
  }

  private setCached(cacheKey: string, value: WebSearchBrief): void {
    const ttlSeconds = this.config.get('WEB_SEARCH_CACHE_TTL_SECONDS');

    if (ttlSeconds <= 0) {
      return;
    }

    this.cache.set(cacheKey, {
      expiresAt: Date.now() + ttlSeconds * 1000,
      value,
    });
  }

  private createCacheKey(providerName: string, input: WebSearchInput): string {
    return [
      providerName,
      input.intent,
      input.locale ?? '',
      input.timezone ?? '',
      input.query.toLowerCase().replace(/\s+/gu, ' '),
    ].join('|');
  }
}
