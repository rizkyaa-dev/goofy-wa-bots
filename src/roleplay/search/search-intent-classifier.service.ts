import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnv } from '../../config/env.validation';
import { LlmService } from '../../llm/llm.service';
import { RoleplayRouteDecision } from '../domain/roleplay-route';
import { SearchDecisionTarget, SearchIntentDecision } from './search-intent.types';
import { WebSearchIntent } from '../../web-search/domain/web-search.types';

type ClassifierInput = {
  latestUserMessage: string;
  routeDecision: RoleplayRouteDecision;
  conversationScope: 'personal_chat' | 'group_chat';
};

type ParsedClassifierDecision = {
  needsWebSearch?: unknown;
  intent?: unknown;
  target?: unknown;
  freshnessNeeded?: unknown;
  queryRewrite?: unknown;
  confidence?: unknown;
  reason?: unknown;
};

@Injectable()
export class SearchIntentClassifierService {
  private readonly logger = new Logger(SearchIntentClassifierService.name);

  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly llm: LlmService,
  ) {}

  isEnabled(): boolean {
    return this.config.get('ROLEPLAY_SEARCH_INTENT_CLASSIFIER_ENABLED');
  }

  async classify(input: ClassifierInput): Promise<SearchIntentDecision> {
    if (!this.isEnabled()) {
      return this.createNoSearchDecision('Search intent classifier disabled.', 'disabled');
    }

    try {
      const result = await this.llm.generateReply({
        providerName: this.config.get('ROLEPLAY_SEARCH_INTENT_CLASSIFIER_PROVIDER'),
        model: this.config.get('ROLEPLAY_SEARCH_INTENT_CLASSIFIER_MODEL') || null,
        temperature: 0,
        maxTokens: 360,
        thinkingType: 'disabled',
        messages: [
          {
            role: 'system',
            content: [
              'You are a search-intent gatekeeper for a WhatsApp roleplay bot.',
              'Decide whether the latest user message needs live internet search before the character replies.',
              'Return strict JSON only. Do not answer the user.',
              '',
              'Search is allowed only for external, public, current-world facts: exchange rates, prices, weather, news, public schedules, current finance, product availability, laws, or other time-sensitive factual data.',
              'Search is forbidden for the character self, current activity, agenda, mood, feelings, relationship, memory, roleplay state, private fictional life, or conversational smalltalk.',
              'If uncertain, set needsWebSearch=false.',
              '',
              'Allowed intent values: exchange_rate, news, weather, price, schedule, finance, general_fresh_fact, null.',
              'Allowed target values: external_world, character_self, relationship, memory, roleplay_state, unclear.',
              'Use queryRewrite only when needsWebSearch=true; make it concise and search-engine friendly.',
            ].join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify({
              latestUserMessage: input.latestUserMessage,
              route: input.routeDecision.route,
              routeConfidence: input.routeDecision.confidence,
              routeReason: input.routeDecision.reason,
              conversationScope: input.conversationScope,
              outputSchema: {
                needsWebSearch: 'boolean',
                intent: 'exchange_rate|news|weather|price|schedule|finance|general_fresh_fact|null',
                target: 'external_world|character_self|relationship|memory|roleplay_state|unclear',
                freshnessNeeded: 'boolean',
                queryRewrite: 'string',
                confidence: 'number 0..1',
                reason: 'short string',
              },
            }),
          },
        ],
      });

      return this.normalizeDecision(this.parseJson(result.text));
    } catch (error) {
      this.logger.warn(`Search intent classifier skipped: ${error instanceof Error ? error.message : String(error)}`);
      return this.createNoSearchDecision('Classifier failed; defaulting to no search.', 'fallback');
    }
  }

  private normalizeDecision(parsed: ParsedClassifierDecision): SearchIntentDecision {
    const target = this.parseTarget(parsed.target);
    const intent = this.parseIntent(parsed.intent);
    const confidence = this.clampConfidence(parsed.confidence);
    const needsWebSearch = Boolean(parsed.needsWebSearch) && target === 'external_world' && intent !== null;
    const queryRewrite = typeof parsed.queryRewrite === 'string' ? parsed.queryRewrite.trim().slice(0, 220) : undefined;
    const reason = typeof parsed.reason === 'string' && parsed.reason.trim()
      ? parsed.reason.trim().slice(0, 220)
      : 'Classifier decision.';

    return {
      needsWebSearch,
      intent,
      target,
      freshnessNeeded: Boolean(parsed.freshnessNeeded),
      queryRewrite,
      confidence,
      reason,
      source: 'classifier',
    };
  }

  private parseJson(text: string): ParsedClassifierDecision {
    const jsonText = text.trim().replace(/^```(?:json)?/iu, '').replace(/```$/iu, '').trim();
    return JSON.parse(jsonText) as ParsedClassifierDecision;
  }

  private parseIntent(value: unknown): WebSearchIntent | null {
    if (
      value === 'exchange_rate' ||
      value === 'news' ||
      value === 'weather' ||
      value === 'price' ||
      value === 'schedule' ||
      value === 'finance' ||
      value === 'general_fresh_fact'
    ) {
      return value;
    }

    return null;
  }

  private parseTarget(value: unknown): SearchDecisionTarget {
    if (
      value === 'external_world' ||
      value === 'character_self' ||
      value === 'relationship' ||
      value === 'memory' ||
      value === 'roleplay_state' ||
      value === 'unclear'
    ) {
      return value;
    }

    return 'unclear';
  }

  private clampConfidence(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  }

  private createNoSearchDecision(reason: string, source: 'disabled' | 'fallback'): SearchIntentDecision {
    return {
      needsWebSearch: false,
      intent: null,
      target: 'unclear',
      freshnessNeeded: false,
      confidence: 0,
      reason,
      source,
    };
  }
}

