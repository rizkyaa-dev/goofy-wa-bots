import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoleplayMemory } from '@prisma/client';
import { AppEnv } from '../../config/env.validation';
import { LlmService } from '../../llm/llm.service';
import { RoleplayEmotionAnalysis } from '../domain/roleplay-emotion-analysis';
import { QuoteCandidate } from '../quote/domain/quote-candidate';
import { QuoteDecision, noQuoteDecision, QuoteIntent } from '../quote/domain/quote-decision';
import { RoleplayRouteDecision, roleplayRoutes, RoleplayRoute } from '../domain/roleplay-route';
import { RoleplayIdentityQuestionDetectorService } from '../identity/roleplay-identity-question-detector.service';
import { IncomingMessage } from '../../messages/domain/incoming-message';

export type PreAnalysisInput = {
  message: IncomingMessage;
  latestUserMessage: string;
  recentContext: string;
  recentMessages: any[];
  candidates: QuoteCandidate[];
  memories: RoleplayMemory[];
  conversationScope: 'personal_chat' | 'group_chat';
};

export type PreAnalysisResult = {
  analysis: RoleplayEmotionAnalysis;
  quoteDecision: QuoteDecision;
  routeDecision: RoleplayRouteDecision;
};

const fallbackAnalysis: RoleplayEmotionAnalysis = {
  userTone: 'neutral',
  userIntent: 'continue_conversation',
  affectionDelta: 0,
  trustDelta: 0,
  tensionDelta: 0,
  energyDelta: 0,
  intimacyDelta: 0,
  shynessDelta: 0,
  curiosityDelta: 0,
  avoidQuestion: false,
  replyDirective: 'Read the user literally and respond naturally.',
};

@Injectable()
export class RoleplayPreAnalyzerService {
  private readonly logger = new Logger(RoleplayPreAnalyzerService.name);

  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly llm: LlmService,
    private readonly identityQuestionDetector: RoleplayIdentityQuestionDetectorService,
  ) {}

  async analyze(input: PreAnalysisInput): Promise<PreAnalysisResult> {
    const deterministicRoute = this.routeDeterministically(input);

    let emotion = fallbackAnalysis;
    let quoteDecision = noQuoteDecision;
    let routeDecision = deterministicRoute;

    const preAnalyzerEnabled = this.config.get('ROLEPLAY_EMOTION_CLASSIFIER_ENABLED');

    if (preAnalyzerEnabled) {
      try {
        const providerName = this.config.get('ROLEPLAY_EMOTION_CLASSIFIER_PROVIDER');
        const modelName = this.config.get('ROLEPLAY_EMOTION_CLASSIFIER_MODEL') || null;

        const result = await this.llm.generateReply({
          providerName,
          model: modelName,
          temperature: 0.1,
          maxTokens: 500, // Safe buffer for unified JSON payload
          thinkingType: 'disabled',
          messages: [
            {
              role: 'system',
              content: [
                'You are an expert conversational pre-analysis engine for a WhatsApp roleplay bot.',
                'Your task is to analyze the latest user message and the recent context, and return a strict JSON payload containing three modules: "emotion", "quote", and "routing".',
                'Output strict JSON only. Do not use markdown code block syntax.',
                '',
                '### MODULE 1: EMOTION CLASSIFICATION',
                '- Analyze the user\'s tone, intent, and emotional impact on the bot (affection, trust, tension, energy, intimacy, shyness, curiosity).',
                '- Allowed userTone: neutral, warm, playful, teasing, vulnerable, annoyed, pressuring, awkward.',
                '- Deltas (affectionDelta, trustDelta, tensionDelta, energyDelta, intimacyDelta, shynessDelta, curiosityDelta) must be integers from -5 to 5.',
                '- intimacyDelta: increases (+1 to +5) when user shares secrets, feelings, deep history, or flirts/romances; decreases (-1 to -5) if user is cold, formal, or business-like.',
                '- shynessDelta: increases (+1 to +5) when user compliments, flirts, teases, or gets close; decreases or remains 0 if user is neutral or hostile.',
                '- curiosityDelta: increases (+1 to +5) when the user brings fresh details, interesting stories, or open topics worth exploring; decreases (-1 to -5) when the user is dry, hostile, repetitive, or obviously uninterested in being engaged further.',
                '- avoidQuestion: set to true if the user seems tired of questions or another question would feel like an interrogation/interview.',
                '- replyDirective: a short, specific instruction for the reply generator.',
                '',
                '### MODULE 2: QUOTE DECISION',
                '- Decide whether the bot should send a normal message or quote-reply a specific previous user message from the candidates list.',
                '- Use quote_reply (action: "quote_reply") only when quoting clearly improves clarity, evidence, teasing, callback, contradiction handling, boundary recall, or emotional continuity.',
                '- Prefer none (action: "none") unless the quote materially helps.',
                '- Never quote latestUserTurn itself. Choose a targetMessageId from the candidates list.',
                '- Never quote secrets, commands, or sensitive data.',
                '- intent: none, clarify, evidence, tease, callback, contradiction, boundary, emotional_recall.',
                '- instruction: a brief guideline on how the quote should be integrated.',
                '',
                '### MODULE 3: ROUTING CLASSIFICATION',
                '- Select the conversational route that best describes what the next assistant reply should do.',
                '- Allowed route values:',
                '  * answer_identity: User asks the character name/identity. Reply directly.',
                '  * smalltalk_react: Light smalltalk where a reaction is enough.',
                '  * smalltalk_continue: Casual question or topic continuation.',
                '  * tease_deflect: Teasing, playful jab, flirting, or light sarcasm.',
                '  * emotional_care: User is tired, sad, vulnerable, stressed, or needs warmth.',
                '  * conflict_boundary: User is pressuring, angry, insulting, or pushing boundaries.',
                '  * ambiguous_clarify: User message is unclear, too short, absurd, or typo-heavy.',
                '  * memory_recall: User asks to remember, prove, recall, or use prior known facts.',
                '  * quote_evidence: User asks for proof and quote target/evidence is relevant.',
                '  * meta_testing: User mentions bot/project/developer/testing/technical meta.',
                '  * factual_answer: User asks a factual, calculation, weather, date, or utility question.',
                '  * casual_default: General fallback.',
                '- confidence: a value from 0 to 1 indicating your classification confidence.',
                '- selfDisclosure: none, small, or normal.',
                '- reason: a short reason for the routing choice.',
              ].join('\n'),
            },
            {
              role: 'user',
              content: JSON.stringify({
                latestUserMessage: input.latestUserMessage,
                recentContext: input.recentContext,
                memories: input.memories.map((m) => ({ kind: m.kind, content: m.content })).slice(0, 8),
                candidates: input.candidates.map((c) => ({ messageId: c.messageId, body: c.body, reasonHint: c.reasonHint })),
                conversationScope: input.conversationScope,
                outputSchema: {
                  emotion: {
                    userTone: 'neutral|warm|playful|teasing|vulnerable|annoyed|pressuring|awkward',
                    userIntent: 'string',
                    affectionDelta: 'integer -5..5',
                    trustDelta: 'integer -5..5',
                    tensionDelta: 'integer -5..5',
                    energyDelta: 'integer -5..5',
                    intimacyDelta: 'integer -5..5',
                    shynessDelta: 'integer -5..5',
                    curiosityDelta: 'integer -5..5',
                    avoidQuestion: 'boolean',
                    replyDirective: 'string'
                  },
                  quote: {
                    action: 'none|quote_reply',
                    targetMessageId: 'string|null',
                    intent: 'none|clarify|evidence|tease|callback|contradiction|boundary|emotional_recall',
                    instruction: 'string'
                  },
                  routing: {
                    route: 'answer_identity|smalltalk_react|...',
                    confidence: 'number 0..1',
                    tone: 'string',
                    questionAllowed: 'boolean',
                    selfDisclosure: 'none|small|normal',
                    needsMemory: 'boolean',
                    needsQuote: 'boolean',
                    reason: 'string'
                  }
                }
              }),
            },
          ],
        });

        const parsed = this.parseUnifiedResponse(result.text, deterministicRoute);
        emotion = parsed.emotion;
        quoteDecision = parsed.quote;
        
        // Only use LLM routing if routing is enabled and deterministic route is not absolute high confidence
        const routerEnabled = this.config.get('ROLEPLAY_ROUTER_ENABLED');
        if (routerEnabled && deterministicRoute.confidence < 0.95 && parsed.routing.confidence >= this.config.get('ROLEPLAY_ROUTER_MIN_CONFIDENCE')) {
          routeDecision = parsed.routing;
        }
      } catch (err) {
        this.logger.error(`Error during unified roleplay pre-analysis: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
        // Fallbacks are already set to default
      }
    }

    return {
      analysis: emotion,
      quoteDecision,
      routeDecision,
    };
  }

  private parseUnifiedResponse(text: string, deterministicRoute: RoleplayRouteDecision): {
    emotion: RoleplayEmotionAnalysis;
    quote: QuoteDecision;
    routing: RoleplayRouteDecision;
  } {
    const jsonText = text.trim().replace(/^```(?:json)?/iu, '').replace(/```$/iu, '').trim();
    const parsed = JSON.parse(jsonText);

    // 1. Parse Emotion Module
    const parsedEmotion = parsed.emotion || {};
    const emotion: RoleplayEmotionAnalysis = {
      userTone: this.isValidTone(parsedEmotion.userTone) ? parsedEmotion.userTone : fallbackAnalysis.userTone,
      userIntent: typeof parsedEmotion.userIntent === 'string' && parsedEmotion.userIntent ? parsedEmotion.userIntent : fallbackAnalysis.userIntent,
      affectionDelta: this.clampDelta(parsedEmotion.affectionDelta),
      trustDelta: this.clampDelta(parsedEmotion.trustDelta),
      tensionDelta: this.clampDelta(parsedEmotion.tensionDelta),
      energyDelta: this.clampDelta(parsedEmotion.energyDelta),
      intimacyDelta: this.clampDelta(parsedEmotion.intimacyDelta),
      shynessDelta: this.clampDelta(parsedEmotion.shynessDelta),
      curiosityDelta: this.clampDelta(parsedEmotion.curiosityDelta),
      avoidQuestion: Boolean(parsedEmotion.avoidQuestion),
      replyDirective: typeof parsedEmotion.replyDirective === 'string' && parsedEmotion.replyDirective
        ? parsedEmotion.replyDirective.slice(0, 220)
        : fallbackAnalysis.replyDirective,
    };

    // 2. Parse Quote Module
    const parsedQuote = parsed.quote || {};
    const quoteAction = parsedQuote.action === 'quote_reply' ? 'quote_reply' : 'none';
    const quote: QuoteDecision = quoteAction === 'none' ? noQuoteDecision : {
      action: 'quote_reply',
      targetMessageId: parsedQuote.targetMessageId ?? undefined,
      intent: this.parseQuoteIntent(parsedQuote.intent),
      instruction: parsedQuote.instruction ?? '',
      confidence: typeof parsedQuote.confidence === 'number' ? parsedQuote.confidence : 0,
    };

    // 3. Parse Routing Module
    const parsedRouting = parsed.routing || {};
    const route = this.parseRoute(parsedRouting.route);
    const routing: RoleplayRouteDecision = {
      route: route ?? deterministicRoute.route,
      confidence: typeof parsedRouting.confidence === 'number' ? Math.max(0, Math.min(1, parsedRouting.confidence)) : 0,
      tone: parsedRouting.tone ?? deterministicRoute.tone,
      questionAllowed: typeof parsedRouting.questionAllowed === 'boolean' ? parsedRouting.questionAllowed : (deterministicRoute.questionAllowed ?? true),
      selfDisclosure: this.parseSelfDisclosure(parsedRouting.selfDisclosure) ?? deterministicRoute.selfDisclosure,
      needsMemory: typeof parsedRouting.needsMemory === 'boolean' ? parsedRouting.needsMemory : deterministicRoute.needsMemory,
      needsQuote: typeof parsedRouting.needsQuote === 'boolean' ? parsedRouting.needsQuote : deterministicRoute.needsQuote,
      reason: parsedRouting.reason ?? deterministicRoute.reason,
    };

    return { emotion, quote, routing };
  }

  private routeDeterministically(input: PreAnalysisInput): RoleplayRouteDecision {
    const text = input.latestUserMessage.trim();
    const lower = text.toLowerCase();

    // Check if quote intent implies evidence
    // Since quoteDecisions has not run yet in deterministic route mode,
    // we match evidence patterns or fallback to check target message id later
    if (this.identityQuestionDetector.isCharacterNameQuestion(lower)) {
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

    if (this.isConflict(lower)) {
      return this.createDecision('conflict_boundary', 0.82, 'neutral', false, 'none', true, false, 'User tone looks conflictual.');
    }

    if (this.isEmotional(lower)) {
      return this.createDecision('emotional_care', 0.78, 'neutral', false, 'small', true, false, 'User may need emotional care.');
    }

    if (this.isTeasing(lower)) {
      return this.createDecision('tease_deflect', 0.75, 'neutral', false, 'small', false, false, 'User tone looks teasing.');
    }

    if (text.endsWith('?')) {
      return this.createDecision('smalltalk_continue', 0.68, 'neutral', false, 'small', true, false, 'User asks a casual question.');
    }

    return this.createDecision('smalltalk_react', 0.62, 'neutral', true, 'small', true, false, 'Default casual chat route.');
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

  private isValidTone(value: unknown): value is RoleplayEmotionAnalysis['userTone'] {
    return (
      value === 'neutral' ||
      value === 'warm' ||
      value === 'playful' ||
      value === 'teasing' ||
      value === 'vulnerable' ||
      value === 'annoyed' ||
      value === 'pressuring' ||
      value === 'awkward'
    );
  }

  private parseQuoteIntent(intent?: string): QuoteIntent {
    if (
      intent === 'clarify' ||
      intent === 'evidence' ||
      intent === 'tease' ||
      intent === 'callback' ||
      intent === 'contradiction' ||
      intent === 'boundary' ||
      intent === 'emotional_recall'
    ) {
      return intent;
    }
    return 'none';
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

  private clampDelta(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 0;
    }
    return Math.max(-5, Math.min(5, Math.round(value)));
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
