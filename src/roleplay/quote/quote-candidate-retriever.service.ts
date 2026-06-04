import { Injectable } from '@nestjs/common';
import { MessageDirection } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { AppEnv } from '../../config/env.validation';
import { ConversationsService } from '../../conversations/conversations.service';
import { QuoteCandidate } from './domain/quote-candidate';
import { RoleplayContextMessageFilterService } from '../context/roleplay-context-message-filter.service';

@Injectable()
export class QuoteCandidateRetrieverService {
  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly conversations: ConversationsService,
    private readonly messageFilter: RoleplayContextMessageFilterService,
  ) {}

  async retrieve(chatId: string): Promise<QuoteCandidate[]> {
    const recentMessages = await this.conversations.getRecentMessages(
      chatId,
      this.config.get('ROLEPLAY_QUOTE_CANDIDATE_LIMIT'),
    );

    return this.messageFilter
      .filter(recentMessages)
      .filter((message) => message.direction === MessageDirection.inbound && !!message.messageId)
      .map((message) => ({
        messageId: message.messageId as string,
        body: message.body,
        createdAt: message.createdAt,
        reasonHint: 'recent_user_message' as const,
      }));
  }
}
