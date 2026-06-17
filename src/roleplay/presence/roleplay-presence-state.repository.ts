import { Injectable } from '@nestjs/common';
import { RoleplayPresenceState } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RoleplayPresenceDraft } from './domain/roleplay-presence.types';

@Injectable()
export class RoleplayPresenceStateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByChatId(chatId: string): Promise<RoleplayPresenceState | null> {
    return this.prisma.roleplayPresenceState.findUnique({
      where: { chatId },
    });
  }

  async save(chatId: string, draft: RoleplayPresenceDraft): Promise<RoleplayPresenceState> {
    return this.prisma.roleplayPresenceState.upsert({
      where: { chatId },
      update: {
        activityType: draft.activityType,
        statusText: draft.statusText,
        locationLabel: draft.locationLabel,
        socialContext: draft.socialContext,
        interruptibility: draft.interruptibility,
        source: draft.source,
        priority: draft.priority,
        startedAt: draft.startedAt,
        expiresAt: draft.expiresAt,
        lastReason: draft.lastReason ?? null,
      },
      create: {
        chatId,
        activityType: draft.activityType,
        statusText: draft.statusText,
        locationLabel: draft.locationLabel,
        socialContext: draft.socialContext,
        interruptibility: draft.interruptibility,
        source: draft.source,
        priority: draft.priority,
        startedAt: draft.startedAt,
        expiresAt: draft.expiresAt,
        lastReason: draft.lastReason ?? null,
      },
    });
  }
}
