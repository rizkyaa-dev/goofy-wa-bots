import { Injectable } from '@nestjs/common';
import { Prisma, ProactiveLog } from '@prisma/client';
import { PrismaService } from '../infra/prisma/prisma.service';

export type ProactiveContact = Prisma.ContactSettingGetPayload<{
  include: { roleplayState: true };
}>;

@Injectable()
export class ProactiveRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveContacts(): Promise<ProactiveContact[]> {
    return this.prisma.contactSetting.findMany({
      where: { mode: 'auto_reply' },
      include: { roleplayState: true },
    });
  }

  upsertState(chatId: string) {
    return this.prisma.roleplayState.upsert({
      where: { chatId },
      update: {},
      create: { chatId },
    });
  }

  findLogsSince(chatId: string, triggerType: string, threshold: Date): Promise<ProactiveLog[]> {
    return this.prisma.proactiveLog.findMany({
      where: {
        chatId,
        triggerType,
        sentAt: { gte: threshold },
      },
    });
  }

  findRecentInactivityLog(chatId: string, since: Date): Promise<ProactiveLog | null> {
    return this.prisma.proactiveLog.findFirst({
      where: {
        chatId,
        triggerType: 'inactivity',
        sentAt: { gte: since },
      },
    });
  }

  hasRecentConversation(chatId: string, since: Date): Promise<boolean> {
    return this.prisma.conversationMessage
      .findFirst({
        where: {
          chatId,
          createdAt: { gte: since },
        },
      })
      .then(Boolean);
  }

  createLog(chatId: string, triggerType: string): Promise<ProactiveLog> {
    return this.prisma.proactiveLog.create({
      data: {
        chatId,
        triggerType,
      },
    });
  }

  updateStateLastInteraction(chatId: string, at: Date) {
    return this.prisma.roleplayState.update({
      where: { chatId },
      data: {
        lastInteractionAt: at,
      },
    });
  }

  createOutboundMessage(chatId: string, body: string) {
    return this.prisma.conversationMessage.create({
      data: {
        chatId,
        direction: 'outbound',
        body,
      },
    });
  }
}
