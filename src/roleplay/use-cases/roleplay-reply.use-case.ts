import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnv } from '../../config/env.validation';
import { LlmProviderError } from '../../llm/errors/llm-provider.error';
import { IncomingMessage } from '../../messages/domain/incoming-message';
import { WebSearchBrief } from '../../web-search/domain/web-search.types';
import { RoleplayAddressPlannerService } from '../address/roleplay-address-planner.service';
import { RoleplayPreAnalyzerService } from '../analyzer/roleplay-pre-analyzer.service';
import { ConversationBuilderService } from '../conversation/conversation-builder.service';
import { RoleplayContinuityService } from '../conversation/roleplay-continuity.service';
import { RecentMessageContextService } from '../context/recent-message-context.service';
import { TimeContextService } from '../context/time-context.service';
import { RoleplayEmotionAnalysis } from '../domain/roleplay-emotion-analysis';
import { RoleplayRouteDecision } from '../domain/roleplay-route';
import { RoleplayReplyResult, RoleplayTurnInput } from '../domain/roleplay-turn';
import { EmotionEngineService } from '../emotion/emotion-engine.service';
import { CharacterProfileService } from '../identity/character-profile.service';
import { RoleplayIntimacyPolicyService } from '../intimacy/roleplay-intimacy-policy.service';
import { RoleplayMemoryService } from '../memory/roleplay-memory.service';
import { ExpertPromptRegistryService } from '../prompt/expert-prompt-registry.service';
import { RoleplayPromptCompilerService } from '../prompt/roleplay-prompt-compiler.service';
import { RoleplayPresenceService } from '../presence/roleplay-presence.service';
import { ConversationalProsodyPlannerService } from '../prosody/conversational-prosody-planner.service';
import { QuoteCandidateRetrieverService } from '../quote/quote-candidate-retriever.service';
import { QuotePolicyService } from '../quote/quote-policy.service';
import { RoleplayLlmExecutionService } from '../response/roleplay-llm-execution.service';
import { RoleplayReplyPostProcessorService } from '../response/roleplay-reply-post-processor.service';
import { ResponseDirectorService } from '../response/response-director.service';
import { RoleplayWebSearchContextService, RoleplayWebSearchDebugTrace } from '../search/roleplay-web-search-context.service';
import { RoleplayStateRepository } from '../state/roleplay-state.repository';
import { RoleplayStateTransitionService } from '../state/roleplay-state-transition.service';

@Injectable()
export class RoleplayReplyUseCase {
  private readonly logger = new Logger(RoleplayReplyUseCase.name);

  constructor(
    private readonly addressPlanner: RoleplayAddressPlannerService,
    private readonly characterProfile: CharacterProfileService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly conversationBuilder: ConversationBuilderService,
    private readonly continuity: RoleplayContinuityService,
    private readonly emotionEngine: EmotionEngineService,
    private readonly llmExecution: RoleplayLlmExecutionService,
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
    private readonly webSearchContext: RoleplayWebSearchContextService,
    private readonly states: RoleplayStateRepository,
    private readonly stateTransition: RoleplayStateTransitionService,
    private readonly timeContext: TimeContextService,
    private readonly preAnalyzer: RoleplayPreAnalyzerService,
  ) {}

  async execute(input: RoleplayTurnInput): Promise<RoleplayReplyResult> {
    const { message, settings } = input;
    const previousState = await this.states.getOrCreate(message.chatId);
    const recentMessages = await this.recentContext.build(message.chatId);
    const continuity = this.continuity.build(recentMessages, message.body);
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
      botState: previousState,
    });

    const analysis = preAnalysis.analysis;
    const rawQuoteDecision = preAnalysis.quoteDecision;
    const routeDecision = preAnalysis.routeDecision;
    const webSearchContext = await this.webSearchContext.resolve({
      latestUserMessage: message.body,
      routeDecision,
      conversationScope,
    });

    const nextStatePatch = this.stateTransition.applyAnalysis(this.emotionEngine.evaluateInbound(previousState, message), analysis);
    // Keep the transition in memory until generation succeeds. A failed provider call
    // must not advance the durable relationship state without a delivered turn.
    const state = {
      ...previousState,
      ...nextStatePatch,
      lastInteractionAt: new Date(),
      updatedAt: new Date(),
    };
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
      continuity,
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
      webSearch: webSearchContext.brief,
      time: this.timeContext.create(previousState),
      memories,
      latestUserTurn: message.body,
      recentMessages,
      addressPlan,
      conversationPlan,
      continuity,
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
      webSearch: webSearchContext.trace,
    });

    try {
      const result = await this.llmExecution.generate(settings, prompt);
      const reply = this.replyPostProcessor.process({
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

      await this.states.updateAfterInbound(message.chatId, nextStatePatch);
      return reply;
    } catch (error) {
      this.logger.error(`Failed to generate reply: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);

      if (error instanceof LlmProviderError) {
        return { text: `Aku lagi agak susah jawab sekarang. (${error.provider}: ${error.message})` };
      }

      return { text: 'Aku lagi agak susah jawab sekarang. Coba kirim lagi sebentar ya.' };
    }
  }

  private formatRecentContext(messages: Array<{ role: string; content: string }>): string {
    return messages
      .slice(-8)
      .map((message) => `${message.role}: ${message.content}`)
      .join('\n');
  }

  private logDebugTrace(trace: RoleplayDebugTrace): void {
    if (!this.config.get('ROLEPLAY_DEBUG_LOG_ENABLED')) {
      return;
    }

    this.logger.debug({
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
      webSearch: trace.webSearch,
    });
  }

}

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
  webSearch: RoleplayWebSearchDebugTrace;
};
