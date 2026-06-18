import { Injectable } from '@nestjs/common';
import { RoleplayPresenceState, RoleplayState } from '@prisma/client';
import { LlmMessage } from '../../llm/domain/llm.types';
import { RoleplayEmotionAnalysis } from '../domain/roleplay-emotion-analysis';
import { RoleplayPresenceAgentService } from './roleplay-presence-agent.service';
import { RoleplayPresenceDirectorService } from './roleplay-presence-director.service';
import { RoleplayPresenceEmotionPolicyService } from './roleplay-presence-emotion-policy.service';
import { RoleplayPresenceStateRepository } from './roleplay-presence-state.repository';

type SyncConversationInput = {
  chatId: string;
  state: RoleplayState;
  latestUserMessage: string;
  recentMessages: LlmMessage[];
  analysis: RoleplayEmotionAnalysis;
};

@Injectable()
export class RoleplayPresenceService {
  constructor(
    private readonly agent: RoleplayPresenceAgentService,
    private readonly director: RoleplayPresenceDirectorService,
    private readonly emotionPolicy: RoleplayPresenceEmotionPolicyService,
    private readonly repository: RoleplayPresenceStateRepository,
  ) {}

  async syncForConversation(input: SyncConversationInput): Promise<RoleplayPresenceState> {
    const now = new Date();
    let presence = await this.ensureCurrentPresence(input.chatId, input.state, now);

    if ((presence.source === 'manual' || presence.source === 'external') && presence.expiresAt.getTime() > now.getTime()) {
      return presence;
    }

    const decision = this.director.createConversationReaction({
      current: presence,
      latestUserMessage: input.latestUserMessage,
      recentMessages: input.recentMessages,
      state: input.state,
      analysis: input.analysis,
      now,
    });

    if (decision.action === 'keep') {
      return presence;
    }

    const biased = this.emotionPolicy.apply({
      draft: decision.draft,
      state: input.state,
      analysis: input.analysis,
    });
    const enhancedDraft = await this.agent.enhance({
      chatId: input.chatId,
      baseline: biased.draft,
      state: input.state,
      current: presence,
      latestUserMessage: input.latestUserMessage,
      recentMessages: input.recentMessages,
      reason: this.withEmotionReason(decision.reason, biased.bias.moodDrive),
      now,
      emotionalBias: biased.bias,
    });

    presence = await this.repository.save(input.chatId, enhancedDraft);
    return presence;
  }

  async ensureCurrentPresence(chatId: string, state: RoleplayState, now = new Date()): Promise<RoleplayPresenceState> {
    const current = await this.repository.findByChatId(chatId);

    if (!current) {
      const scheduled = this.director.createScheduledPresence({ chatId, state, now });
      const biased = this.emotionPolicy.apply({
        draft: scheduled.draft,
        state,
      });
      const enhancedDraft = await this.agent.enhance({
        chatId,
        baseline: biased.draft,
        state,
        current: null,
        reason: this.withEmotionReason(scheduled.reason, biased.bias.moodDrive),
        now,
        emotionalBias: biased.bias,
      });

      return this.repository.save(chatId, enhancedDraft);
    }

    if (this.director.isLockedByHigherPrioritySource(current, now)) {
      return current;
    }

    if (!this.director.isExpired(current, now)) {
      return current;
    }

    const scheduled = this.director.createScheduledPresence({ chatId, state, now });
    const biased = this.emotionPolicy.apply({
      draft: scheduled.draft,
      state,
    });
    const enhancedDraft = await this.agent.enhance({
      chatId,
      baseline: biased.draft,
      state,
      current,
      reason: this.withEmotionReason(scheduled.reason, biased.bias.moodDrive),
      now,
      emotionalBias: biased.bias,
    });

    return this.repository.save(chatId, enhancedDraft);
  }

  private withEmotionReason(reason: string, moodDrive: string): string {
    return `${reason}; emotion_bias=${moodDrive}`;
  }
}
