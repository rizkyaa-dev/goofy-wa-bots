import { Injectable } from '@nestjs/common';
import { PrismaService } from '../infra/prisma/prisma.service';
import { IncomingMessage } from '../messages/domain/incoming-message';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async recordInbound(message: IncomingMessage): Promise<void> {
    await this.prisma.conversationMessage.upsert({
      where: { messageId: message.id },
      update: {},
      create: {
        messageId: message.id,
        chatId: message.chatId,
        authorId: message.authorId,
        direction: 'inbound',
        body: message.body,
      },
    });
  }

  async recordOutbound(chatId: string, text: string, inboundMessageId?: string): Promise<void> {
    const messageId = inboundMessageId ? `reply:${inboundMessageId}` : undefined;

    if (!messageId) {
      await this.prisma.conversationMessage.create({
        data: {
          chatId,
          direction: 'outbound',
          body: text,
        },
      });
      return;
    }

    await this.prisma.conversationMessage.upsert({
      where: { messageId },
      update: {},
      create: {
        messageId,
        chatId,
        direction: 'outbound',
        body: text,
      },
    });
  }
}
