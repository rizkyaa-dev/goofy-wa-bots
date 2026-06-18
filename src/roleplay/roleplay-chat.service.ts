import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContactSetting } from '@prisma/client';
import { BotReply } from '../bot/domain/bot-reply';
import { AppEnv } from '../config/env.validation';
import { LlmProviderError } from '../llm/errors/llm-provider.error';
import { LlmService } from '../llm/llm.service';
import { IncomingMessage } from '../messages/domain/incoming-message';
import { RoleplayAddressPlannerService } from './address/roleplay-address-planner.service';
import { RoleplayPreAnalyzerService } from './analyzer/roleplay-pre-analyzer.service';
import { ConversationBuilderService } from './conversation/conversation-builder.service';
import { RecentMessageContextService } from './context/recent-message-context.service';
import { TimeContextService } from './context/time-context.service';
import { RoleplayEmotionAnalysis } from './domain/roleplay-emotion-analysis';
import { EmotionEngineService } from './emotion/emotion-engine.service';
import { CharacterProfileService } from './identity/character-profile.service';
import { RoleplayIntimacyPolicyService } from './intimacy/roleplay-intimacy-policy.service';
import { RoleplayMemoryService } from './memory/roleplay-memory.service';
import { ExpertPromptRegistryService } from './prompt/expert-prompt-registry.service';
import { RoleplayPromptCompilerService } from './prompt/roleplay-prompt-compiler.service';
import { RoleplayPresenceService } from './presence/roleplay-presence.service';
import { ConversationalProsodyPlannerService } from './prosody/conversational-prosody-planner.service';
import { QuoteCandidateRetrieverService } from './quote/quote-candidate-retriever.service';
import { QuotePolicyService } from './quote/quote-policy.service';
import { RoleplayReplyPostProcessorService } from './response/roleplay-reply-post-processor.service';
import { ResponseDirectorService } from './response/response-director.service';
import { RoleplayStateRepository } from './state/roleplay-state.repository';

@Injectable()
export class RoleplayChatService {
  private readonly logger = new Logger(RoleplayChatService.name);

  constructor(
    private readonly addressPlanner: RoleplayAddressPlannerService,
    private readonly characterProfile: CharacterProfileService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly conversationBuilder: ConversationBuilderService,
    private readonly emotionEngine: EmotionEngineService,
    private readonly llm: LlmService,
    private readonly memories: RoleplayMemoryService,
    private readonly expertPrompts: ExpertPromptRegistryService,
    private readonly intimacyPolicy: RoleplayIntimacyPolicyService,
    private readonly promptCompiler: RoleplayPromptCompilerService,
    private readonly presence: RoleplayPresenceService,
    private readonly prosodyPlanner: ConversationalProsodyPlannerService,
    private readonly quoteCandidates: QuoteCandidateRetrieverService,
    private readonly quotePolicy: QuotePolicyService,
    private readonly recentContext: RecentMessageContextService,
    private readonly replyPostProcessor: RoleplayReplyPostProcessorService,
    private readonly responseDirector: ResponseDirectorService,
    private readonly states: RoleplayStateRepository,
    private readonly timeContext: TimeContextService,
    private readonly preAnalyzer: RoleplayPreAnalyzerService,
  ) {}

  async generateReply(message: IncomingMessage, settings: ContactSetting): Promise<BotReply> {
    const previousState = await this.states.getOrCreate(message.chatId);
    const recentMessages = await this.recentContext.build(message.chatId);
    const conversationScope = message.isGroup ? 'group_chat' : 'personal_chat';

    await this.memories.captureFromInbound(message, this.formatRecentContext(recentMessages));
    const memories = await this.memories.retrieve(message.chatId, message.body);
    const quoteCandidates = await this.quoteCandidates.retrieve(message.chatId);

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

    const nextStatePatch = this.applyAnalysis(this.emotionEngine.evaluateInbound(previousState, message), analysis);
    const state = await this.states.updateAfterInbound(message.chatId, nextStatePatch);
    const intimacyPolicy = this.intimacyPolicy.create({
      state,
      latestUserMessage: message.body,
      analysis,
      routeDecision,
      conversationScope,
    });
    const presence = await this.presence.syncForConversation({
      chatId: message.chatId,
      state,
      latestUserMessage: message.body,
      recentMessages,
      analysis,
    });

    const quoteDecision = this.quotePolicy.apply(rawQuoteDecision, quoteCandidates, message.id);
    const quoteTarget = quoteCandidates.find((candidate) => candidate.messageId === quoteDecision.targetMessageId);

    const conversationPlan = this.conversationBuilder.create({
      latestUserMessage: message.body,
      recentMessages,
      memories,
      state,
      analysis,
      routeDecision,
      intimacyPolicy,
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
      presence,
      time: this.timeContext.create(previousState),
      memories,
      latestUserTurn: message.body,
      recentMessages,
      addressPlan,
      conversationPlan,
      intimacyPolicy,
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
      presenceActivity: presence.activityType,
      presenceSource: presence.source,
      presenceStatus: presence.statusText,
      intimacyExplicitness: intimacyPolicy.explicitness,
      intimacyTone: intimacyPolicy.tone,
    });

    try {
      const result = await this.llm.generateReply({
        providerName: settings.llmProvider,
        model: settings.llmModel,
        messages: prompt,
      });

      return this.replyPostProcessor.process({
        text: result.text,
        delimiter: prosodyPlan.delimiter,
        maxBubbles: prosodyPlan.maxBubbles,
        allowSentenceFallbackSplit: prosodyPlan.allowSentenceFallbackSplit,
        interBubbleDelayMs: prosodyPlan.interBubbleDelayMs,
        latestUserMessage: message.body,
        recentMessages,
        characterName: profile.name,
        memories,
        quoteTargetText: quoteTarget?.body,
        quoteMessageId: quoteDecision.action === 'quote_reply' ? quoteDecision.targetMessageId : undefined,
        responsePlan,
        conversationScope,
        usage: result.usage,
      });
    } catch (error) {
      if (error instanceof LlmProviderError) {
        return { text: `Aku lagi agak susah jawab sekarang. (${error.provider}: ${error.message})` };
      }

      return { text: 'Aku lagi agak susah jawab sekarang. Coba kirim lagi sebentar ya.' };
    }
  }

  private applyAnalysis<T extends StatePatch>(statePatch: T, analysis: RoleplayEmotionAnalysis): T {
    return {
      ...statePatch,
      affection: this.clampStateValue(statePatch.affection + analysis.affectionDelta),
      trust: this.clampStateValue(statePatch.trust + analysis.trustDelta),
      tension: this.clampStateValue(statePatch.tension + analysis.tensionDelta),
      energy: this.clampStateValue(statePatch.energy + analysis.energyDelta),
      intimacy: this.clampStateValue(((statePatch as any).intimacy ?? 10) + (analysis.intimacyDelta ?? 0)),
      shyness: this.clampStateValue(((statePatch as any).shyness ?? 15) + (analysis.shynessDelta ?? 0)),
      curiosity: this.clampStateValue(((statePatch as any).curiosity ?? 55) + (analysis.curiosityDelta ?? 0)),
      volatility: this.clampStateValue(((statePatch as any).volatility ?? 15) + (analysis.volatilityDelta ?? 0)),
      desire: this.clampStateValue(((statePatch as any).desire ?? 20) + (analysis.desireDelta ?? 0)),
      inhibition: this.clampStateValue(((statePatch as any).inhibition ?? 55) + (analysis.inhibitionDelta ?? 0)),
      comfort: this.clampStateValue(((statePatch as any).comfort ?? 55) + (analysis.comfortDelta ?? 0)),
      compliance: this.clampStateValue(((statePatch as any).compliance ?? 40) + (analysis.complianceDelta ?? 0)),
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
          intimacy: trace.analysis.intimacyDelta,
          shyness: trace.analysis.shynessDelta,
          curiosity: trace.analysis.curiosityDelta,
          volatility: trace.analysis.volatilityDelta,
          desire: trace.analysis.desireDelta,
          inhibition: trace.analysis.inhibitionDelta,
          comfort: trace.analysis.comfortDelta,
          compliance: trace.analysis.complianceDelta,
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
        presenceActivity: trace.presenceActivity,
        presenceSource: trace.presenceSource,
        presenceStatus: trace.presenceStatus,
        intimacyExplicitness: trace.intimacyExplicitness,
        intimacyTone: trace.intimacyTone,
      }),
    );
  }
}

type StatePatch = {
  mood:
    | 'neutral'
    | 'happy'
    | 'sad'
    | 'annoyed'
    | 'warm'
    | 'playful'
    | 'sleepy'
    | 'excited'
    | 'jealous'
    | 'worried'
    | 'swing'
    | 'sensual'
    | 'flirty'
    | 'aroused'
    | 'unrestrained'
    | 'needy';
  affection: number;
  trust: number;
  energy: number;
  tension: number;
  intimacy: number;
  shyness: number;
  curiosity: number;
  volatility: number;
  desire: number;
  inhibition: number;
  comfort: number;
  compliance: number;
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
  presenceActivity: string;
  presenceSource: string;
  presenceStatus: string;
  intimacyExplicitness: string;
  intimacyTone: string;
};
