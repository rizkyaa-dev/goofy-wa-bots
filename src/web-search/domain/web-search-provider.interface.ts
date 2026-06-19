import { WebSearchBrief, WebSearchInput } from './web-search.types';

export interface WebSearchProvider {
  readonly name: string;
  search(input: WebSearchInput): Promise<WebSearchBrief>;
}

export const WEB_SEARCH_PROVIDER_REGISTRY = Symbol('WEB_SEARCH_PROVIDER_REGISTRY');
