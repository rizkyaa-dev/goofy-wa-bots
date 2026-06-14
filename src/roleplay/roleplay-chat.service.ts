import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContactSetting } from '@prisma/client';
import { BotReply, BotReplyPart } from '../bot/domain/bot-reply';
import { AppEnv } from '../config/env.validation';
import { ConversationsService } from '../conversations/conversations.service';
import { LlmProviderError } from '../llm/errors/llm-provider.error';
import { LlmService } from '../llm/llm.service';
import { IncomingMessage } from '../messages/domain/incoming-message';
import { RoleplayAddressPlannerService } from './address/roleplay-address-planner.service';
import { CharacterProfileService } from './character-profile.service';
import { ConversationBuilderService } from './conversation/conversation-builder.service';
import { ContinuityGuardService } from './continuity-guard.service';
import { RecentMessageContextService } from './context/recent-message-context.service';
import { RoleplayEmotionAnalysis } from './domain/roleplay-emotion-analysis';
import { EmotionEngineService } from './emotion-engine.service';
import { RoleplayMemoryService } from './memory/roleplay-memory.service';
import { ExpertPromptRegistryService } from './prompt/expert-prompt-registry.service';
import { RoleplayPromptCompilerService } from './prompt/roleplay-prompt-compiler.service';
import { ConversationalProsodyPlannerService } from './prosody/conversational-prosody-planner.service';
import { QuoteCandidateRetrieverService } from './quote/quote-candidate-retriever.service';
import { QuotePolicyService } from './quote/quote-policy.service';
import { ResponseDirectorService } from './response-director.service';
import { ResponseValidatorService } from './response-validator.service';
import { RoleplayStateRepository } from './roleplay-state.repository';
import { TimeContextService } from './time-context.service';
import { RoleplayPreAnalyzerService } from './roleplay-pre-analyzer.service';

@Injectable()
export class RoleplayChatService {
  private readonly logger = new Logger(RoleplayChatService.name);

  constructor(
    private readonly addressPlanner: RoleplayAddressPlannerService,
    private readonly characterProfile: CharacterProfileService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly conversationBuilder: ConversationBuilderService,
    private readonly continuityGuard: ContinuityGuardService,
    private readonly conversations: ConversationsService,
    private readonly emotionEngine: EmotionEngineService,
    private readonly llm: LlmService,
    private readonly memories: RoleplayMemoryService,
    private readonly expertPrompts: ExpertPromptRegistryService,
    private readonly promptCompiler: RoleplayPromptCompilerService,
    private readonly prosodyPlanner: ConversationalProsodyPlannerService,
    private readonly quoteCandidates: QuoteCandidateRetrieverService,
    private readonly quotePolicy: QuotePolicyService,
    private readonly recentContext: RecentMessageContextService,
    private readonly responseDirector: ResponseDirectorService,
    private readonly responseValidator: ResponseValidatorService,
    private readonly states: RoleplayStateRepository,
    private readonly timeContext: TimeContextService,
    private readonly preAnalyzer: RoleplayPreAnalyzerService,
  ) {}

  async generateReply(message: IncomingMessage, settings: ContactSetting): Promise<BotReply> {
    const previousState = await this.states.getOrCreate(message.chatId);
    const recentMessages = await this.recentContext.build(message.chatId);
    const conversationScope = message.isGroup ? 'group_chat' : 'personal_chat';

    // 1. Capture and retrieve long-term memories first
    await this.memories.captureFromInbound(message, this.formatRecentContext(recentMessages));
    const memories = await this.memories.retrieve(message.chatId, message.body);

    // 2. Fetch candidates for WhatsApp quotes
    const quoteCandidates = await this.quoteCandidates.retrieve(message.chatId);

    // 3. Unified Single LLM Pre-Analysis (Emotions, Quotes, and Routing)
    const preAnalysis = await this.preAnalyzer.analyze({
      message,
      latestUserMessage: message.body,
      recentContext: this.formatRecentContext(recentMessages),
      recentMessages,
      candidates: quoteCandidates,
      memories,
      conversationScope,
    });

    const analysis = preAnalysis.analysis;
    const rawQuoteDecision = preAnalysis.quoteDecision;
    const routeDecision = preAnalysis.routeDecision;

    // 4. Evaluate and apply state/emotional updates
    const nextStatePatch = this.applyAnalysis(this.emotionEngine.evaluateInbound(previousState, message), analysis);
    const state = await this.states.updateAfterInbound(message.chatId, nextStatePatch);

    // 5. Apply the WhatsApp quote policy
    const quoteDecision = this.quotePolicy.apply(
      rawQuoteDecision,
      quoteCandidates,
      message.id,
    );
    const quoteTarget = quoteCandidates.find((candidate) => candidate.messageId === quoteDecision.targetMessageId);

    const conversationPlan = this.conversationBuilder.create({
      latestUserMessage: message.body,
      recentMessages,
      memories,
      analysis,
      routeDecision,
      quoteIntent: quoteDecision.intent,
      conversationScope,
    });
    const addressPlan = this.addressPlanner.create({
      latestUserMessage: message.body,
      recentMessages,
      memories,
      routeDecision,
      conversationPlan,
    });
    const responsePlan = this.responseDirector.createPlan({
      latestUserMessage: message.body,
      recentMessages,
      analysis,
      conversationScope,
      routeDecision,
      conversationPlan,
      quoteIntent: quoteDecision.intent,
    });
    const prosodyPlan = this.prosodyPlanner.create({
      latestUserMessage: message.body,
      recentMessages,
      analysis,
      conversationPlan,
      responsePlan,
      quoteAction: quoteDecision.action,
    });

    const profile = this.characterProfile.getProfile(settings.persona);
    const prompt = this.promptCompiler.compile({
      profile,
      state,
      time: this.timeContext.create(previousState),
      memories,
      latestUserTurn: message.body,
      recentMessages,
      addressPlan,
      conversationPlan,
      analysis,
      conversationScope,
      responsePlan,
      prosodyPlan,
      expertPrompt: this.expertPrompts.get(routeDecision.route),
      quoteDecision,
      quoteTargetText: quoteTarget?.body,
    });

    this.logDebugTrace({
      message,
      analysis,
      memoryCount: memories.length,
      quoteAction: quoteDecision.action,
      quoteIntent: quoteDecision.intent,
      route: routeDecision.route,
      routeConfidence: routeDecision.confidence,
      conversationTopic: conversationPlan.topic,
      userMove: conversationPlan.userMove,
      botMove: conversationPlan.botMove,
      warmth: conversationPlan.warmth,
      followUpPolicy: conversationPlan.followUpPolicy,
      addressMode: addressPlan.mode,
      preferredNickname: addressPlan.preferredNickname,
      affectionateAlias: addressPlan.affectionateAlias,
      responseMode: responsePlan.mode,
      replyShape: responsePlan.replyShape,
      emotionalTexture: responsePlan.emotionalTexture,
      playfulness: responsePlan.playfulness,
      topicDevelopment: responsePlan.topicDevelopment,
      prosodyRhythm: prosodyPlan.rhythm,
      maxBubbles: prosodyPlan.maxBubbles,
      questionAllowed: responsePlan.questionAllowed,
      selfDisclosure: responsePlan.selfDisclosure,
    });

    try {
      const result = await this.llm.generateReply({
        providerName: settings.llmProvider,
        model: settings.llmModel,
        messages: prompt,
      });

      const cleanedParts = this.parseReplyParts({
        text: result.text,
        delimiter: prosodyPlan.delimiter,
        maxBubbles: prosodyPlan.maxBubbles,
        allowSentenceFallbackSplit: prosodyPlan.allowSentenceFallbackSplit,
      })
        .map((part) => this.cleanReply(part, recentMessages))
        .filter((part) => part.trim().length > 0);
      const continuitySafeParts = cleanedParts.map((part) =>
        this.continuityGuard.apply({
          text: part,
          latestUserMessage: message.body,
          characterName: profile.name,
          recentMessages,
          memories,
          quoteTargetText: quoteTarget?.body,
        }),
      );
      const validatedParts = this.responseValidator.applyToParts({
        parts: continuitySafeParts,
        latestUserMessage: message.body,
        recentMessages,
        plan: responsePlan,
        conversationScope,
      });
      const parts = this.createReplyParts({
        texts: validatedParts.slice(0, prosodyPlan.maxBubbles),
        quoteMessageId: quoteDecision.action === 'quote_reply' ? quoteDecision.targetMessageId : undefined,
        interBubbleDelayMs: prosodyPlan.interBubbleDelayMs,
      });

      return {
        text: parts.map((part) => part.text).join('\n'),
        quoteMessageId: parts[0]?.quoteMessageId,
        parts,
      };
    } catch (error) {
      if (error instanceof LlmProviderError) {
        return { text: `Aku lagi agak susah jawab sekarang. (${error.provider}: ${error.message})` };
      }

      return { text: 'Aku lagi agak susah jawab sekarang. Coba kirim lagi sebentar ya.' };
    }
  }

  private parseReplyParts(input: {
    text: string;
    delimiter: string;
    maxBubbles: number;
    allowSentenceFallbackSplit: boolean;
  }): string[] {
    const { text, delimiter, maxBubbles, allowSentenceFallbackSplit } = input;
    const normalized = text.trim().replace(/\r\n/g, '\n');

    if (maxBubbles <= 1) {
      return [normalized.replaceAll(delimiter, ' ')];
    }

    const delimiterPattern = new RegExp(`\\s*${this.escapeRegExp(delimiter)}\\s*`, 'gu');
    const rawParts = normalized.includes(delimiter)
      ? normalized.split(delimiterPattern)
      : this.createSentenceFallbackParts(normalized, maxBubbles, allowSentenceFallbackSplit);
    const parts = rawParts.map((part) => part.trim()).filter(Boolean);

    if (parts.length <= maxBubbles) {
      return parts.length > 0 ? parts : [normalized];
    }

    return [...parts.slice(0, maxBubbles - 1), parts.slice(maxBubbles - 1).join(' ')];
  }

  private createSentenceFallbackParts(text: string, maxBubbles: number, allowSplit: boolean): string[] {
    if (!allowSplit) {
      return [text];
    }

    const sentences = this.splitSentences(text);

    if (sentences.length < 2) {
      return [text];
    }

    if (sentences.length <= maxBubbles) {
      return sentences;
    }

    return [...sentences.slice(0, maxBubbles - 1), sentences.slice(maxBubbles - 1).join(' ')];
  }

  private splitSentences(text: string): string[] {
    return text.match(/[^.!?]+[.!?]?/gu)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
  }

  private createReplyParts(input: {
    texts: string[];
    quoteMessageId?: string;
    interBubbleDelayMs: number;
  }): BotReplyPart[] {
    return input.texts
      .map((text, index) => ({
        text,
        quoteMessageId: index === 0 ? input.quoteMessageId : undefined,
        delayMs: index === 0 ? 0 : input.interBubbleDelayMs,
      }))
      .filter((part) => part.text.trim().length > 0);
  }

  private escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private cleanReply(text: string, recentMessages: Array<{ role: string; content: string }>): string {
    const cleaned = text
      .trim()
      .replace(/^["']|["']$/g, '')
      .replace(/<<<NEXT>>>/gu, ' ')
      .replace(/^\s*(?:[-*]|\d+[.)])\s+/u, '')
      .replace(/^\s*[\w .-]{1,32}:\s*/, '')
      .replace(/\[.*?]/g, '')
      .replace(/\((?:[^()]|\([^()]*\)){1,120}\)/g, '')
      .replace(/\*([^*]{1,160})\*/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return this.limitEmoji(
      this.limitInterviewQuestion(
        this.limitRepeatedChatFiller(this.naturalizeSocialTemplate(this.naturalizeEmotionSelfReport(cleaned)), recentMessages),
        recentMessages,
      ),
      recentMessages,
    );
  }

  private naturalizeEmotionSelfReport(text: string): string {
    return text
      .replace(/\buntung\s+aku\s+lagi\s+mood\s+bagus\b/giu, 'untung aku lagi baik hati')
      .replace(/\blagi\s+mood\s+bagus\b/giu, 'lagi baik hati')
      .replace(/\bmood[-\s]*(?:ku|aku)\s+bisa\s+anjlok\b/giu, 'aku bisa bete')
      .replace(/\bmood[-\s]*(?:ku|aku)\s+(?:naik\s+turun|naik-turun)\b/giu, 'aku jadi maju mundur')
      .replace(/\bbikin\s+mood[-\s]*(?:ku|aku)\s+(?:naik\s+turun|naik-turun)\b/giu, 'bikin aku maju mundur')
      .replace(/\brusuh\s+mood\s+pagiku\b/giu, 'rusuh pagi-pagiku')
      .replace(/\bkalau\s+dikatain\s+jelek,\s*enaknya\s+marah\s+apa\s+ketawa\s+ya\s+sekarang\?/giu, 'jahat amat. aku ketawa dikit aja deh')
      .replace(/\bmood[-\s]*(?:ku|aku)\b/giu, 'aku')
      .replace(/\bemosi(?:ku| aku)?\b/giu, 'aku')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private naturalizeSocialTemplate(text: string): string {
    return text
      .replace(/\bsenang\s+kenal\s+(?:sama|dengan)\s+kamu[,.!\s]*/giu, '')
      .replace(/\bsalam\s+kenal[,.!\s]*/giu, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.!?])/gu, '$1')
      .replace(/^[,.\s]+/gu, '')
      .trim();
  }

  private applyAnalysis<T extends StatePatch>(statePatch: T, analysis: RoleplayEmotionAnalysis): T {
    return {
      ...statePatch,
      affection: this.clampStateValue(statePatch.affection + analysis.affectionDelta),
      trust: this.clampStateValue(statePatch.trust + analysis.trustDelta),
      tension: this.clampStateValue(statePatch.tension + analysis.tensionDelta),
      energy: this.clampStateValue(statePatch.energy + analysis.energyDelta),
    };
  }

  private formatRecentContext(messages: Array<{ role: string; content: string }>): string {
    return messages
      .slice(-8)
      .map((message) => `${message.role}: ${message.content}`)
      .join('\n');
  }

  private clampStateValue(value: number): number {
    return Math.max(0, Math.min(100, value));
  }

  private logDebugTrace(trace: RoleplayDebugTrace): void {
    if (!this.config.get('ROLEPLAY_DEBUG_LOG_ENABLED')) {
      return;
    }

    this.logger.debug(
      JSON.stringify({
        chatId: trace.message.chatId,
        isGroup: trace.message.isGroup,
        tone: trace.analysis.userTone,
        intent: trace.analysis.userIntent,
        avoidQuestion: trace.analysis.avoidQuestion,
        deltas: {
          affection: trace.analysis.affectionDelta,
          trust: trace.analysis.trustDelta,
          tension: trace.analysis.tensionDelta,
          energy: trace.analysis.energyDelta,
        },
        memoryCount: trace.memoryCount,
        quoteAction: trace.quoteAction,
        quoteIntent: trace.quoteIntent,
        route: trace.route,
        routeConfidence: Number(trace.routeConfidence.toFixed(2)),
        conversationTopic: trace.conversationTopic,
        userMove: trace.userMove,
        botMove: trace.botMove,
        warmth: trace.warmth,
        followUpPolicy: trace.followUpPolicy,
        addressMode: trace.addressMode,
        preferredNickname: trace.preferredNickname,
        affectionateAlias: trace.affectionateAlias,
        responseMode: trace.responseMode,
        replyShape: trace.replyShape,
        emotionalTexture: trace.emotionalTexture,
        playfulness: trace.playfulness,
        topicDevelopment: trace.topicDevelopment,
        prosodyRhythm: trace.prosodyRhythm,
        maxBubbles: trace.maxBubbles,
        questionAllowed: trace.questionAllowed,
        selfDisclosure: trace.selfDisclosure,
      }),
    );
  }

  private limitEmoji(text: string, recentMessages: Array<{ role: string; content: string }>): string {
    if (this.recentAssistantUsedEmoji(recentMessages)) {
      return text.replace(/\p{Extended_Pictographic}/gu, '').replace(/\s{2,}/g, ' ').trim();
    }

    let emojiSeen = false;

    return text
      .replace(/\p{Extended_Pictographic}/gu, (emoji) => {
        if (emojiSeen) {
          return '';
        }

        emojiSeen = true;
        return emoji;
      })
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private limitRepeatedChatFiller(text: string, recentMessages: Array<{ role: string; content: string }>): string {
    const recentAssistantText = recentMessages
      .filter((message) => message.role === 'assistant')
      .slice(-2)
      .map((message) => message.content.toLowerCase())
      .join('\n');

    const repeatedFillers = ['hehe', 'wkwk', 'haha', 'hmm', 'hm'].filter((filler) =>
      new RegExp(`\\b${filler}\\b`, 'u').test(recentAssistantText),
    );

    if (repeatedFillers.length === 0) {
      return text;
    }

    return repeatedFillers
      .reduce((current, filler) => current.replace(new RegExp(`\\b${filler}\\b[,.!?\\s]*`, 'giu'), ''), text)
      .replace(/\s+([,.!?])/gu, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private limitInterviewQuestion(text: string, recentMessages: Array<{ role: string; content: string }>): string {
    if (!this.recentAssistantAskedQuestion(recentMessages)) {
      return text;
    }

    const sentences = text.match(/[^.!?]+[.!?]?/gu)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [text];

    if (sentences.length < 2 || !sentences.at(-1)?.endsWith('?')) {
      return text;
    }

    return sentences
      .slice(0, -1)
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private recentAssistantUsedEmoji(recentMessages: Array<{ role: string; content: string }>): boolean {
    return recentMessages
      .filter((message) => message.role === 'assistant')
      .slice(-2)
      .some((message) => /\p{Extended_Pictographic}/u.test(message.content));
  }

  private recentAssistantAskedQuestion(recentMessages: Array<{ role: string; content: string }>): boolean {
    return recentMessages
      .filter((message) => message.role === 'assistant')
      .slice(-2)
      .some((message) => message.content.trim().endsWith('?'));
  }
}

type StatePatch = {
  mood: 'neutral' | 'happy' | 'sad' | 'annoyed' | 'warm' | 'playful';
  affection: number;
  trust: number;
  energy: number;
  tension: number;
};

type RoleplayDebugTrace = {
  message: IncomingMessage;
  analysis: RoleplayEmotionAnalysis;
  memoryCount: number;
  quoteAction: string;
  quoteIntent: string;
  route: string;
  routeConfidence: number;
  conversationTopic: string;
  userMove: string;
  botMove: string;
  warmth: string;
  followUpPolicy: string;
  addressMode: string;
  preferredNickname?: string;
  affectionateAlias?: string;
  responseMode: string;
  replyShape: string;
  emotionalTexture: string;
  playfulness: string;
  topicDevelopment: string;
  prosodyRhythm: string;
  maxBubbles: number;
  questionAllowed: boolean;
  selfDisclosure: string;
};
