import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContactSetting } from '@prisma/client';
import { BotReply } from '../bot/domain/bot-reply';
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
import { EmotionClassifierService } from './emotion-classifier.service';
import { EmotionEngineService } from './emotion-engine.service';
import { RoleplayMemoryService } from './memory/roleplay-memory.service';
import { ExpertPromptRegistryService } from './prompt/expert-prompt-registry.service';
import { RoleplayPromptCompilerService } from './prompt/roleplay-prompt-compiler.service';
import { QuoteCandidateRetrieverService } from './quote/quote-candidate-retriever.service';
import { QuoteDecisionService } from './quote/quote-decision.service';
import { QuotePolicyService } from './quote/quote-policy.service';
import { ResponseDirectorService } from './response-director.service';
import { ResponseValidatorService } from './response-validator.service';
import { RoleplayRouterService } from './roleplay-router.service';
import { RoleplayStateRepository } from './roleplay-state.repository';
import { TimeContextService } from './time-context.service';

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
    private readonly emotionClassifier: EmotionClassifierService,
    private readonly emotionEngine: EmotionEngineService,
    private readonly llm: LlmService,
    private readonly memories: RoleplayMemoryService,
    private readonly expertPrompts: ExpertPromptRegistryService,
    private readonly promptCompiler: RoleplayPromptCompilerService,
    private readonly quoteCandidates: QuoteCandidateRetrieverService,
    private readonly quoteDecisions: QuoteDecisionService,
    private readonly quotePolicy: QuotePolicyService,
    private readonly recentContext: RecentMessageContextService,
    private readonly responseDirector: ResponseDirectorService,
    private readonly responseValidator: ResponseValidatorService,
    private readonly router: RoleplayRouterService,
    private readonly states: RoleplayStateRepository,
    private readonly timeContext: TimeContextService,
  ) {}

  async generateReply(message: IncomingMessage, settings: ContactSetting): Promise<BotReply> {
    const previousState = await this.states.getOrCreate(message.chatId);
    const recentMessages = await this.recentContext.build(message.chatId);
    const analysis = await this.emotionClassifier.analyze(message, this.formatRecentContext(recentMessages));
    const nextStatePatch = this.applyAnalysis(this.emotionEngine.evaluateInbound(previousState, message), analysis);
    const state = await this.states.updateAfterInbound(message.chatId, nextStatePatch);

    await this.memories.captureFromInbound(message, this.formatRecentContext(recentMessages));

    const memories = await this.memories.retrieve(message.chatId, message.body);
    const quoteCandidates = await this.quoteCandidates.retrieve(message.chatId);
    const quoteDecision = this.quotePolicy.apply(
      await this.quoteDecisions.decide({
        latestUserTurn: message.body,
        recentContext: this.formatRecentContext(recentMessages),
        candidates: quoteCandidates,
        memories,
      }),
      quoteCandidates,
      message.id,
    );
    const quoteTarget = quoteCandidates.find((candidate) => candidate.messageId === quoteDecision.targetMessageId);
    const conversationScope = message.isGroup ? 'group_chat' : 'personal_chat';
    const routeDecision = await this.router.route({
      latestUserMessage: message.body,
      recentMessages,
      memories,
      analysis,
      conversationScope,
      quoteIntent: quoteDecision.intent,
    });
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
      questionAllowed: responsePlan.questionAllowed,
      selfDisclosure: responsePlan.selfDisclosure,
    });

    try {
      const result = await this.llm.generateReply({
        providerName: settings.llmProvider,
        model: settings.llmModel,
        messages: prompt,
      });

      const cleanedReply = this.cleanReply(result.text, recentMessages);

      const continuitySafeReply = this.continuityGuard.apply({
        text: cleanedReply,
        latestUserMessage: message.body,
        characterName: profile.name,
        recentMessages,
        memories,
        quoteTargetText: quoteTarget?.body,
      });
      const validatedReply = this.responseValidator.apply({
        text: continuitySafeReply,
        latestUserMessage: message.body,
        recentMessages,
        plan: responsePlan,
        conversationScope,
      });

      return {
        text: validatedReply,
        quoteMessageId: quoteDecision.action === 'quote_reply' ? quoteDecision.targetMessageId : undefined,
      };
    } catch (error) {
      if (error instanceof LlmProviderError) {
        return { text: `Aku lagi agak susah jawab sekarang. (${error.provider}: ${error.message})` };
      }

      return { text: 'Aku lagi agak susah jawab sekarang. Coba kirim lagi sebentar ya.' };
    }
  }

  private cleanReply(text: string, recentMessages: Array<{ role: string; content: string }>): string {
    const cleaned = text
      .trim()
      .replace(/^["']|["']$/g, '')
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
  questionAllowed: boolean;
  selfDisclosure: string;
};
