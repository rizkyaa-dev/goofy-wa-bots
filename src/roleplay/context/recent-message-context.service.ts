import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageDirection } from '@prisma/client';
import { AppEnv } from '../../config/env.validation';
import { ConversationsService } from '../../conversations/conversations.service';
import { LlmMessage } from '../../llm/domain/llm.types';

@Injectable()
export class RecentMessageContextService {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async build(chatId: string): Promise<LlmMessage[]> {
    const recentMessages = await this.conversations.getRecentMessages(chatId, this.config.get('ROLEPLAY_RECENT_MESSAGE_LIMIT'));

    return recentMessages.map((message) => ({
      role: message.direction === MessageDirection.outbound ? 'assistant' : 'user',
      content: message.body,
    }));
  }
}
