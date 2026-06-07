import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoleplayMemory } from '@prisma/client';
import { AppEnv } from '../config/env.validation';
import { LlmMessage } from '../llm/domain/llm.types';
import { LlmService } from '../llm/llm.service';
import { RoleplayEmotionAnalysis } from './domain/roleplay-emotion-analysis';
import { RoleplayRoute, RoleplayRouteDecision, roleplayRoutes } from './domain/roleplay-route';

type RouteInput = {
  latestUserMessage: string;
  recentMessages: LlmMessage[];
  memories: RoleplayMemory[];
  analysis: RoleplayEmotionAnalysis;
  conversationScope: 'personal_chat' | 'group_chat';
  quoteIntent?: string;
};

type RouterResponse = {
  route?: string;
  confidence?: number;
  tone?: string;
  questionAllowed?: boolean;
  selfDisclosure?: string;
  needsMemory?: boolean;
  needsQuote?: boolean;
  reason?: string;
};

@Injectable()
export class RoleplayRouterService {
  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly llm: LlmService,
  ) {}

  async route(input: RouteInput): Promise<RoleplayRouteDecision> {
    const deterministic = this.routeDeterministically(input);

    if (!this.config.get('ROLEPLAY_ROUTER_ENABLED') || deterministic.confidence >= 0.95) {
      return deterministic;
    }

    try {
      const routed = await this.routeWithLlm(input, deterministic);
      return routed.confidence >= this.config.get('ROLEPLAY_ROUTER_MIN_CONFIDENCE') ? routed : deterministic;
    } catch {
      return deterministic;
    }
  }

  private routeDeterministically(input: RouteInput): RoleplayRouteDecision {
    const text = input.latestUserMessage.trim();
    const lower = text.toLowerCase();

    if (input.quoteIntent === 'evidence') {
      return this.createDecision('quote_evidence', 1, 'evidence', false, 'small', true, true, 'Quote decision requested evidence.');
    }

    if (this.isCharacterNameQuestion(lower)) {
      return this.createDecision('answer_identity', 1, 'direct', false, 'none', false, false, 'User asks character identity.');
    }

    if (this.isAmbiguous(text)) {
      return this.createDecision('ambiguous_clarify', 0.95, 'unclear', true, 'none', false, false, 'User message is too short or ambiguous.');
    }

    if (this.isMetaTesting(lower)) {
      return this.createDecision('meta_testing', 0.92, 'meta', false, 'none', false, false, 'User mentions bot/project/developer/testing.');
    }

    if (this.isMemoryRecall(lower)) {
      return this.createDecision('memory_recall', 0.9, 'recall', false, 'none', true, true, 'User asks about remembered context or proof.');
    }

    if (this.isFactualQuestion(lower)) {
      return this.createDecision('factual_answer', 0.88, 'factual', false, 'small', true, false, 'User asks for factual or utility information.');
    }

    if (this.isConflict(lower) || input.analysis.userTone === 'pressuring' || input.analysis.userTone === 'annoyed') {
      return this.createDecision('conflict_boundary', 0.82, input.analysis.userTone, false, 'none', true, false, 'User tone looks conflictual or pressuring.');
    }

    if (this.isEmotional(lower) || input.analysis.userTone === 'vulnerable') {
      return this.createDecision('emotional_care', 0.78, input.analysis.userTone, false, 'small', true, false, 'User may need emotional care.');
    }

    if (this.isTeasing(lower) || input.analysis.userTone === 'teasing') {
      return this.createDecision('tease_deflect', 0.75, input.analysis.userTone, false, 'small', false, false, 'User tone looks teasing.');
    }

    if (text.endsWith('?')) {
      return this.createDecision('smalltalk_continue', 0.68, input.analysis.userTone, false, 'small', true, false, 'User asks a casual question.');
    }

    return this.createDecision('smalltalk_react', 0.62, input.analysis.userTone, true, 'small', true, false, 'Default casual chat route.');
  }

  private async routeWithLlm(input: RouteInput, fallback: RoleplayRouteDecision): Promise<RoleplayRouteDecision> {
    const result = await this.llm.generateReply({
      providerName: this.config.get('ROLEPLAY_ROUTER_PROVIDER'),
      model: this.config.get('ROLEPLAY_ROUTER_MODEL'),
      temperature: 0.1,
      maxTokens: 420,
      thinkingType: 'disabled',
      messages: [
        {
          role: 'system',
          content: [
            'You are a route classifier for a WhatsApp roleplay chatbot.',
            'Choose the response route that best describes what the next assistant reply should do.',
            'Route by response function, not by vague genre.',
            'Return strict JSON only. No markdown.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            latestUserMessage: input.latestUserMessage,
            conversationScope: input.conversationScope,
            recentContext: this.formatRecentContext(input.recentMessages),
            memories: input.memories.map((memory) => ({ kind: memory.kind, content: memory.content })).slice(0, 8),
            classifier: {
              userTone: input.analysis.userTone,
              userIntent: input.analysis.userIntent,
              replyDirective: input.analysis.replyDirective,
              avoidQuestion: input.analysis.avoidQuestion,
            },
            fallback,
            routes: roleplayRoutes,
            routeDefinitions: {
              answer_identity: 'User asks the character name/identity. Reply directly.',
              smalltalk_react: 'Light smalltalk where a reaction is enough.',
              smalltalk_continue: 'Casual question or topic continuation.',
              tease_deflect: 'Teasing, playful jab, flirting, or light sarcasm.',
              emotional_care: 'User is tired, sad, vulnerable, stressed, or needs warmth.',
              conflict_boundary: 'User is pressuring, angry, insulting, or pushing boundaries.',
              ambiguous_clarify: 'User message is unclear, too short, absurd, or typo-heavy.',
              memory_recall: 'User asks to remember, prove, recall, or use prior known facts.',
              quote_evidence: 'User asks for proof and quote target/evidence is relevant.',
              meta_testing: 'User mentions bot/project/developer/testing/technical meta.',
              factual_answer: 'User asks a factual, calculation, current-info, meaning, price, currency, weather, date, or utility question.',
              casual_default: 'General fallback.',
            },
            outputSchema: {
              route: roleplayRoutes.join('|'),
              confidence: 'number 0..1',
              tone: 'short tone label',
              questionAllowed: 'boolean',
              selfDisclosure: 'none|small|normal',
              needsMemory: 'boolean',
              needsQuote: 'boolean',
              reason: 'short reason',
            },
          }),
        },
      ],
    });

    return this.parse(result.text, fallback);
  }

  private parse(text: string, fallback: RoleplayRouteDecision): RoleplayRouteDecision {
    const jsonText = text.trim().replace(/^```(?:json)?/iu, '').replace(/```$/iu, '').trim();
    const parsed = JSON.parse(jsonText) as RouterResponse;
    const route = this.parseRoute(parsed.route);

    if (!route) {
      return fallback;
    }

    return this.createDecision(
      route,
      typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      parsed.tone ?? fallback.tone,
      typeof parsed.questionAllowed === 'boolean' ? parsed.questionAllowed : fallback.questionAllowed ?? true,
      this.parseSelfDisclosure(parsed.selfDisclosure) ?? fallback.selfDisclosure,
      typeof parsed.needsMemory === 'boolean' ? parsed.needsMemory : fallback.needsMemory,
      typeof parsed.needsQuote === 'boolean' ? parsed.needsQuote : fallback.needsQuote,
      parsed.reason ?? fallback.reason,
    );
  }

  private createDecision(
    route: RoleplayRoute,
    confidence: number,
    tone: string,
    questionAllowed: boolean,
    selfDisclosure: RoleplayRouteDecision['selfDisclosure'],
    needsMemory: boolean,
    needsQuote: boolean,
    reason: string,
  ): RoleplayRouteDecision {
    return {
      route,
      confidence: Math.max(0, Math.min(1, confidence)),
      tone,
      questionAllowed,
      selfDisclosure,
      needsMemory,
      needsQuote,
      reason,
    };
  }

  private parseRoute(route?: string): RoleplayRoute | null {
    return roleplayRoutes.includes(route as RoleplayRoute) ? (route as RoleplayRoute) : null;
  }

  private parseSelfDisclosure(value?: string): RoleplayRouteDecision['selfDisclosure'] | null {
    if (value === 'none' || value === 'small' || value === 'normal') {
      return value;
    }

    return null;
  }

  private formatRecentContext(messages: LlmMessage[]): string {
    return messages
      .slice(-8)
      .map((message) => `${message.role}: ${message.content}`)
      .join('\n');
  }

  private isCharacterNameQuestion(text: string): boolean {
    return /\b(?:namamu|nama\s+(?:kamu|mu|bot|alya)|(?:kamu|alya|bot)\s+siapa|siapa\s+(?:kamu|alya|bot))\b/u.test(text);
  }

  private isAmbiguous(text: string): boolean {
    return text.length <= 2 || /^[-_.]+$/u.test(text);
  }

  private isMetaTesting(text: string): boolean {
    return /\b(?:bot|project|proyek|developer|develop|testing|tes|kode|program)\b/u.test(text);
  }

  private isMemoryRecall(text: string): boolean {
    return /\b(?:ingat|inget|bukti|pernah|mana|quote|reply|panggil|namaku|nama\s+ku)\b/u.test(text);
  }

  private isConflict(text: string): boolean {
    return /\b(?:jangan|stop|ngeselin|nyebelin|jahat|marah|benci|kesel|ganggu)\b/u.test(text);
  }

  private isEmotional(text: string): boolean {
    return /\b(?:capek|cape|sedih|takut|cemas|pusing|stress|stres|kesepian|sendiri|lelah|down)\b/u.test(text);
  }

  private isTeasing(text: string): boolean {
    return /\b(?:jelek|genit|gombal|manja|cie|modus|wkwk|haha|anjay)\b/u.test(text);
  }

  private isFactualQuestion(text: string): boolean {
    if (!/[?]|(?:\b(?:berapa|brp|apa|kapan|dimana|di mana|kenapa|gimana|bagaimana)\b)/u.test(text)) {
      return false;
    }

    return /\b(?:usd|dolar|dollar|rupiah|idr|harga|kurs|cuaca|tanggal|jam|arti|definisi|siapa presiden|berapa\s+\d|hitung|kalkulasi|rekomendasi|translate|terjemah)\b/u.test(
      text,
    );
  }
}
