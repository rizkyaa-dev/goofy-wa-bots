import { Module } from '@nestjs/common';
import { WEB_SEARCH_PROVIDER_REGISTRY } from './domain/web-search-provider.interface';
import { GeminiGroundedSearchProvider } from './providers/gemini-grounded-search.provider';
import { WebSearchService } from './web-search.service';

@Module({
  providers: [
    GeminiGroundedSearchProvider,
    {
      provide: WEB_SEARCH_PROVIDER_REGISTRY,
      useFactory: (gemini: GeminiGroundedSearchProvider) => [gemini],
      inject: [GeminiGroundedSearchProvider],
    },
    WebSearchService,
  ],
  exports: [WebSearchService],
})
export class WebSearchModule {}
