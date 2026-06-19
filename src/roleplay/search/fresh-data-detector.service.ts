import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnv } from '../../config/env.validation';
import { RoleplayRouteDecision } from '../domain/roleplay-route';
import { WebSearchInput, WebSearchIntent } from '../../web-search/domain/web-search.types';
import { SearchIntentClassifierService } from './search-intent-classifier.service';
import { SearchDetectionResult, SearchIntentDecision } from './search-intent.types';

type DetectInput = {
  latestUserMessage: string;
  routeDecision: RoleplayRouteDecision;
  conversationScope: 'personal_chat' | 'group_chat';
};

@Injectable()
export class FreshDataDetectorService {
  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly classifier: SearchIntentClassifierService,
  ) {}

  async detect(input: DetectInput): Promise<SearchDetectionResult> {
    const text = input.latestUserMessage.trim();
    const lower = text.toLowerCase();

    if (!text || this.isClearlyRoleplayOnly(lower)) {
      return this.noSearch('Message targets character presence or roleplay context.', 'deterministic', 'character_self');
    }

    const intent = this.resolveIntent(lower);

    if (!intent) {
      return this.noSearch('No fresh-data signal found.', 'deterministic');
    }

    if (this.canUseDeterministicFastPath(intent)) {
      const decision = this.createSearchDecision(intent, text, 'Strong deterministic fresh-data signal.');
      return { request: this.toRequest(text, decision), decision };
    }

    if (!this.requiresFreshData(lower, intent, input.routeDecision)) {
      return this.noSearch('Freshness signal is not strong enough for this route.', 'deterministic');
    }

    const decision = await this.classifier.classify(input);
    const minConfidence = this.config.get('ROLEPLAY_SEARCH_INTENT_CLASSIFIER_MIN_CONFIDENCE');

    if (!decision.needsWebSearch || decision.confidence < minConfidence || decision.intent === null) {
      return { request: null, decision };
    }

    return {
      request: this.toRequest(text, decision),
      decision,
    };
  }

  private resolveIntent(text: string): WebSearchIntent | null {
    if (this.hasAny(text, ['kurs', 'dollar', 'dolar', 'usd', 'eur', 'yen', 'sgd', 'idr', 'rupiah', 'exchange rate'])) {
      return 'exchange_rate';
    }

    if (this.hasAny(text, ['cuaca', 'hujan', 'panas', 'prakiraan'])) {
      return 'weather';
    }

    if (this.hasAny(text, ['saham', 'crypto', 'kripto', 'bitcoin', 'btc', 'eth', 'emas', 'ihsg', 'nasdaq'])) {
      return 'finance';
    }

    if (this.hasAny(text, ['harga', 'diskon', 'promo', 'biaya', 'tarif'])) {
      return 'price';
    }

    if (this.hasAny(text, ['jadwal', 'kapan', 'rilis', 'tayang', 'tanding', 'event'])) {
      return 'schedule';
    }

    if (this.hasAny(text, ['berita', 'news', 'terbaru', 'update', 'viral', 'kejadian'])) {
      return 'news';
    }

    if (this.hasAny(text, ['sekarang', 'hari ini', 'saat ini', 'terkini', 'terbaru', 'latest', 'current'])) {
      return 'general_fresh_fact';
    }

    return null;
  }

  private requiresFreshData(text: string, intent: WebSearchIntent, routeDecision: RoleplayRouteDecision): boolean {
    if (intent === 'general_fresh_fact') {
      return routeDecision.route === 'factual_answer';
    }

    if (this.hasAny(text, ['sekarang', 'hari ini', 'saat ini', 'terkini', 'terbaru', 'latest', 'current', 'real time', 'realtime'])) {
      return true;
    }

    return routeDecision.route === 'factual_answer' && intent !== null;
  }

  private canUseDeterministicFastPath(intent: WebSearchIntent): boolean {
    return intent === 'exchange_rate' || intent === 'weather' || intent === 'finance' || intent === 'news';
  }

  private toRequest(originalQuery: string, decision: SearchIntentDecision): WebSearchInput | null {
    if (!decision.needsWebSearch || !decision.intent) {
      return null;
    }

    return {
      query: decision.queryRewrite?.trim() || originalQuery,
      intent: decision.intent,
      locale: 'id-ID',
      timezone: 'Asia/Jakarta',
    };
  }

  private createSearchDecision(intent: WebSearchIntent, query: string, reason: string): SearchIntentDecision {
    return {
      needsWebSearch: true,
      intent,
      target: 'external_world',
      freshnessNeeded: true,
      queryRewrite: query,
      confidence: 1,
      reason,
      source: 'deterministic',
    };
  }

  private noSearch(
    reason: string,
    source: SearchIntentDecision['source'],
    target: SearchIntentDecision['target'] = 'unclear',
  ): SearchDetectionResult {
    return {
      request: null,
      decision: {
        needsWebSearch: false,
        intent: null,
        target,
        freshnessNeeded: false,
        confidence: 1,
        reason,
        source,
      },
    };
  }

  private isClearlyRoleplayOnly(text: string): boolean {
    return (
      this.hasAny(text, ['lagi apa', 'lagi ngapain', 'di mana kamu', 'dimana kamu', 'kamu ngapain']) ||
      this.isCharacterSelfActivityQuestion(text)
    );
  }

  private isCharacterSelfActivityQuestion(text: string): boolean {
    if (!this.hasAny(text, ['kamu', 'dirimu', 'alya'])) {
      return false;
    }

    return this.hasAny(text, [
      'ada agenda',
      'agenda apa',
      'jadwal kamu',
      'rencana kamu',
      'ada rencana',
      'kegiatan kamu',
      'aktivitas kamu',
      'aktifitas kamu',
      'ada acara',
      'acara apa',
      'sibuk apa',
      'kamu sibuk',
      'kerjaan kamu',
      'kerja apa',
      'hari ini ngapain',
    ]);
  }

  private hasAny(text: string, patterns: string[]): boolean {
    return patterns.some((pattern) => text.includes(pattern));
  }
}
