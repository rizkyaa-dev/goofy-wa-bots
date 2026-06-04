import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageDirection } from '@prisma/client';
import { AppEnv } from '../../config/env.validation';
import { ConversationsService } from '../../conversations/conversations.service';
import { LlmMessage } from '../../llm/domain/llm.types';
import { RoleplayContextMessageFilterService } from './roleplay-context-message-filter.service';

@Injectable()
export class RecentMessageContextService {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly messageFilter: RoleplayContextMessageFilterService,
  ) {}

  async build(chatId: string): Promise<LlmMessage[]> {
    const recentMessages = await this.conversations.getRecentMessages(chatId, this.config.get('ROLEPLAY_RECENT_MESSAGE_LIMIT'));

    return this.coalesceConsecutiveMessages(
      this.messageFilter.filter(recentMessages).map((message) => ({
        role: message.direction === MessageDirection.outbound ? 'assistant' : 'user',
        content: message.body,
      })),
    );
  }

  private coalesceConsecutiveMessages(messages: LlmMessage[]): LlmMessage[] {
    const coalescedMessages: LlmMessage[] = [];

    for (const message of messages) {
      const previousMessage = coalescedMessages.at(-1);

      if (previousMessage?.role === message.role) {
        previousMessage.content = `${previousMessage.content}\n${message.content}`;
        continue;
      }

      coalescedMessages.push({ ...message });
    }

    return coalescedMessages;
  }
}
