import { Injectable } from '@nestjs/common';
import { ContactSetting } from '@prisma/client';
import { BotReply } from '../bot/domain/bot-reply';
import { ConversationsService } from '../conversations/conversations.service';
import { LlmProviderError } from '../llm/errors/llm-provider.error';
import { LlmService } from '../llm/llm.service';
import { IncomingMessage } from '../messages/domain/incoming-message';
import { CharacterProfileService } from './character-profile.service';
import { RecentMessageContextService } from './context/recent-message-context.service';
import { RoleplayEmotionAnalysis } from './domain/roleplay-emotion-analysis';
import { EmotionClassifierService } from './emotion-classifier.service';
import { EmotionEngineService } from './emotion-engine.service';
import { RoleplayMemoryService } from './memory/roleplay-memory.service';
import { RoleplayPromptCompilerService } from './prompt/roleplay-prompt-compiler.service';
import { QuoteCandidateRetrieverService } from './quote/quote-candidate-retriever.service';
import { QuoteDecisionService } from './quote/quote-decision.service';
import { QuotePolicyService } from './quote/quote-policy.service';
import { RoleplayStateRepository } from './roleplay-state.repository';
import { TimeContextService } from './time-context.service';

@Injectable()
export class RoleplayChatService {
  constructor(
    private readonly characterProfile: CharacterProfileService,
    private readonly conversations: ConversationsService,
    private readonly emotionClassifier: EmotionClassifierService,
    private readonly emotionEngine: EmotionEngineService,
    private readonly llm: LlmService,
    private readonly memories: RoleplayMemoryService,
    private readonly promptCompiler: RoleplayPromptCompilerService,
    private readonly quoteCandidates: QuoteCandidateRetrieverService,
    private readonly quoteDecisions: QuoteDecisionService,
    private readonly quotePolicy: QuotePolicyService,
    private readonly recentContext: RecentMessageContextService,
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

    const memories = await this.memories.retrieve(message.chatId);
    const quoteCandidates = await this.quoteCandidates.retrieve(message.chatId);
    const quoteDecision = this.quotePolicy.apply(
      await this.quoteDecisions.decide({
        latestUserTurn: message.body,
        recentContext: this.formatRecentContext(recentMessages),
        candidates: quoteCandidates,
        memories,
        settings,
      }),
      quoteCandidates,
    );
    const quoteTarget = quoteCandidates.find((candidate) => candidate.messageId === quoteDecision.targetMessageId);

    const prompt = this.promptCompiler.compile({
      profile: this.characterProfile.getProfile(settings.persona),
      state,
      time: this.timeContext.create(previousState),
      memories,
      recentMessages,
      analysis,
      conversationScope: message.isGroup ? 'group_chat' : 'personal_chat',
      quoteDecision,
      quoteTargetText: quoteTarget?.body,
    });

    try {
      const result = await this.llm.generateReply({
        providerName: settings.llmProvider,
        model: settings.llmModel,
        messages: prompt,
      });

      return {
        text: this.cleanReply(result.text, recentMessages),
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

    return this.limitEmoji(cleaned, recentMessages);
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

  private recentAssistantUsedEmoji(recentMessages: Array<{ role: string; content: string }>): boolean {
    return recentMessages
      .filter((message) => message.role === 'assistant')
      .slice(-2)
      .some((message) => /\p{Extended_Pictographic}/u.test(message.content));
  }
}

type StatePatch = {
  mood: 'neutral' | 'happy' | 'sad' | 'annoyed' | 'warm' | 'playful';
  affection: number;
  trust: number;
  energy: number;
  tension: number;
};
