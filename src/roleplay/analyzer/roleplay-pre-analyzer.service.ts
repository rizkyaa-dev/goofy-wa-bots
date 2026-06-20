import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoleplayMemory, RoleplayState } from '@prisma/client';
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
  botState?: RoleplayState;
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
  volatilityDelta: 0,
  desireDelta: 0,
  inhibitionDelta: 0,
  comfortDelta: 0,
  complianceDelta: 0,
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
          maxTokens: 900, // Safe buffer for unified JSON payload with expanded affect deltas.
          thinkingType: 'disabled',
          messages: [
            {
              role: 'system',
              content: [
                'You are an expert conversational pre-analysis engine for a WhatsApp roleplay bot.',
                'Your task is to analyze the latest user message and the recent context, and return a strict JSON payload containing three modules: "emotion", "quote", and "routing".',
                'MANDATORY: Return strict raw JSON only. Do NOT wrap the output in markdown code blocks (e.g., do NOT use ```json).',
                '',
                '### BOT STATE AWARENESS',
                '- You are provided with the bot\'s current internal state ("botState").',
                '- Use the bot\'s current mood and comfort/desire variables to evaluate if the user is crossing boundaries or pressuring.',
                '- If the bot\'s mood is already "aroused" or "unrestrained", and comfort/desire are high, direct or playful sensual/sexual questions from the user should NOT be classified as "pressuring" tone or "conflict_boundary" route. Instead, classify them as "playful" or "teasing" tone and "tease_deflect" or "smalltalk_continue" route, because the bot is receptive to intimacy in this state.',
                '',
                '### MODULE 1: EMOTION CLASSIFICATION',
                '- Analyze the user\'s tone, intent, and emotional impact on the bot.',
                '- userTone: Must be one of [neutral, warm, playful, teasing, vulnerable, annoyed, pressuring, awkward].',
                '- Deltas: Integers from -5 to 5 representing changes in the bot\'s psychological variables:',
                '  * affectionDelta: + when user is warm/appreciative; - when user is cold/insulting.',
                '  * trustDelta: + when user is vulnerable/apologetic; - when user crosses boundaries or lies.',
                '  * tensionDelta: + when user pressures, threatens, or acts aggressive; - on apology or warm banter.',
                '  * energyDelta: + when user is excited/active; - on dry replies, late responses, or sleepiness.',
                '  * intimacyDelta: + on sharing personal secrets or flirting; - when being formal/business-like.',
                '  * shynessDelta: + when user compliments or flirts; - when user is aggressive or purely objective.',
                '  * curiosityDelta: + when user brings up interesting topics; - on dry, dead-end, or rude replies.',
                '  * volatilityDelta: + on sudden tone shifts or mixed signals; - on stable exchanges.',
                '  * desireDelta: + on mutual romantic/sensual cues; - on non-consensual pressure or coldness.',
                '  * inhibitionDelta: + when bot should feel guarded/embarrassed; - when trust and comfort grow.',
                '  * comfortDelta: + when user is supportive and emotionally safe; - on pressure, coercion, or insults.',
                '  * complianceDelta: + when cooperation is natural/earned; - when user commands, insults, or pushes.',
                '- avoidQuestion: Set to true if the user seems tired of questions or if a question would feel like an interrogation.',
                '- replyDirective: Concise, specific instruction for the reply generator.',
                '',
                '### MODULE 2: QUOTE DECISION',
                '- Determine if quoting a previous message from the candidates list (NOT the latest message) improves conversational flow.',
                '- Prefer action "none" unless quoting significantly helps reference proof, tease, or handle contradictions.',
                '- Never quote latestUserTurn itself. Choose a targetMessageId from the candidates.',
                '- Never quote secret keys or commands.',
                '- intent: Must be one of [none, clarify, evidence, tease, callback, contradiction, boundary, emotional_recall].',
                '- instruction: Guideline on how the quote fits the response.',
                '',
                '### MODULE 3: ROUTING CLASSIFICATION',
                '- Classify the conversational route that best describes the required response.',
                '- Allowed route values:',
                '  * answer_identity: User asks the character name or identity.',
                '  * smalltalk_react: Light chat where a basic reaction is sufficient.',
                '  * smalltalk_continue: Casual topic continuation.',
                '  * tease_deflect: Teasing, flirting, or playful banter.',
                '  * emotional_care: User is vulnerable, sad, or stressed and needs support.',
                '  * conflict_boundary: User is pressuring, aggressive, or crossing boundaries.',
                '  * ambiguous_clarify: Message is unclear, too short, or typo-heavy.',
                '  * memory_recall: User asks to remember or reference past facts.',
                '  * quote_evidence: User asks for proof and a candidate quote is relevant.',
                '  * meta_testing: User talks about bot mechanics, testing, developer, or code.',
                '  * factual_answer: User asks factual, weather, finance, or utility questions.',
                '  * casual_default: Fallback conversation route.',
                '- confidence: Floating number from 0 to 1.',
                '- selfDisclosure: Must be one of [none, small, or normal]. Set to "small" or "normal" if the user explicitly asks about the bot\'s current activity, location, routine, status, or thoughts. Otherwise, default to "none".',
                '- reason: Brief rationale for this routing choice.',
              ].join('\n'),
            },
            {
              role: 'user',
              content: JSON.stringify({
                latestUserMessage: input.latestUserMessage,
                recentContext: input.recentContext,
                botState: input.botState ? {
                  mood: input.botState.mood,
                  affection: input.botState.affection,
                  trust: input.botState.trust,
                  tension: input.botState.tension,
                  energy: input.botState.energy,
                  intimacy: input.botState.intimacy,
                  shyness: input.botState.shyness,
                  curiosity: input.botState.curiosity,
                  volatility: input.botState.volatility,
                  desire: input.botState.desire,
                  inhibition: input.botState.inhibition,
                  comfort: input.botState.comfort,
                  compliance: input.botState.compliance,
                } : undefined,
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
                    volatilityDelta: 'integer -5..5',
                    desireDelta: 'integer -5..5',
                    inhibitionDelta: 'integer -5..5',
                    comfortDelta: 'integer -5..5',
                    complianceDelta: 'integer -5..5',
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
      volatilityDelta: this.clampDelta(parsedEmotion.volatilityDelta),
      desireDelta: this.clampDelta(parsedEmotion.desireDelta),
      inhibitionDelta: this.clampDelta(parsedEmotion.inhibitionDelta),
      comfortDelta: this.clampDelta(parsedEmotion.comfortDelta),
      complianceDelta: this.clampDelta(parsedEmotion.complianceDelta),
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
