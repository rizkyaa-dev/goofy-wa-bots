import { Injectable } from '@nestjs/common';
import { RoleplayPresenceState, RoleplayState } from '@prisma/client';
import { LlmMessage } from '../../llm/domain/llm.types';
import { RoleplayEmotionAnalysis } from '../domain/roleplay-emotion-analysis';
import { RoleplayPresenceAgentService } from './roleplay-presence-agent.service';
import { RoleplayPresenceDirectorService } from './roleplay-presence-director.service';
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

    const enhancedDraft = await this.agent.enhance({
      chatId: input.chatId,
      baseline: decision.draft,
      state: input.state,
      current: presence,
      latestUserMessage: input.latestUserMessage,
      recentMessages: input.recentMessages,
      reason: decision.reason,
      now,
    });

    presence = await this.repository.save(input.chatId, enhancedDraft);
    return presence;
  }

  async ensureCurrentPresence(chatId: string, state: RoleplayState, now = new Date()): Promise<RoleplayPresenceState> {
    const current = await this.repository.findByChatId(chatId);

    if (!current) {
      const scheduled = this.director.createScheduledPresence({ chatId, state, now });
      const enhancedDraft = await this.agent.enhance({
        chatId,
        baseline: scheduled.draft,
        state,
        current: null,
        reason: scheduled.reason,
        now,
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
    const enhancedDraft = await this.agent.enhance({
      chatId,
      baseline: scheduled.draft,
      state,
      current,
      reason: scheduled.reason,
      now,
    });

    return this.repository.save(chatId, enhancedDraft);
  }
}
