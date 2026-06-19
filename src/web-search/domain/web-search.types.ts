export type WebSearchIntent =
  | 'exchange_rate'
  | 'news'
  | 'weather'
  | 'price'
  | 'schedule'
  | 'finance'
  | 'general_fresh_fact';

export type WebSearchInput = {
  query: string;
  intent: WebSearchIntent;
  locale?: string;
  timezone?: string;
  maxSources?: number;
  timeoutMs?: number;
};

export type WebSearchSource = {
  title: string;
  url: string;
  snippet?: string;
};

export type WebSearchFreshness = 'realtime' | 'recent' | 'unknown';

export type WebSearchBrief = {
  provider: string;
  model?: string;
  query: string;
  answer: string;
  facts: string[];
  sources: WebSearchSource[];
  searchedAt: Date;
  freshness: WebSearchFreshness;
  confidence: number;
};

export class WebSearchQualityError extends Error {
  constructor(
    message: string,
    readonly details: {
      intent: WebSearchIntent;
      provider: string;
      confidence: number;
      sourceCount: number;
    },
  ) {
    super(message);
    this.name = 'WebSearchQualityError';
  }
}
