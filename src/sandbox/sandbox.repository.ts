import { Injectable } from '@nestjs/common';
import { RoleplayMood } from '@prisma/client';
import { PrismaService } from '../infra/prisma/prisma.service';
import {
  SandboxAddMemoryInput,
  SandboxPresenceUpdateInput,
  SandboxStateUpdateInput,
} from './sandbox.validation';

@Injectable()
export class SandboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async ensureContact(chatId: string) {
    const existing = await this.prisma.contactSetting.findUnique({
      where: { chatId },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.contactSetting.create({
      data: {
        chatId,
        mode: 'auto_reply',
      },
    });
  }

  async getStateBundle(chatId: string, messageLimit: number) {
    const state = await this.prisma.roleplayState.upsert({
      where: { chatId },
      update: {},
      create: { chatId },
    });
    const presence = await this.prisma.roleplayPresenceState.findUnique({
      where: { chatId },
    });
    const memories = await this.prisma.roleplayMemory.findMany({
      where: { chatId },
      orderBy: { updatedAt: 'desc' },
    });
    const messages = await this.prisma.conversationMessage.findMany({
      where: { chatId },
      orderBy: { createdAt: 'desc' },
      take: messageLimit,
    });

    return {
      state,
      presence,
      memories,
      messages: messages.reverse(),
    };
  }

  upsertState(chatId: string, data: SandboxStateUpdateInput) {
    return this.prisma.roleplayState.upsert({
      where: { chatId },
      create: {
        chatId,
        mood: data.mood ?? RoleplayMood.neutral,
        affection: data.affection ?? 50,
        trust: data.trust ?? 50,
        energy: data.energy ?? 70,
        tension: data.tension ?? 0,
        intimacy: data.intimacy ?? 10,
        shyness: data.shyness ?? 15,
        curiosity: data.curiosity ?? 55,
        volatility: data.volatility ?? 15,
        desire: data.desire ?? 20,
        inhibition: data.inhibition ?? 55,
        comfort: data.comfort ?? 55,
        compliance: data.compliance ?? 40,
        summary: data.summary ?? '',
      },
      update: data,
    });
  }

  upsertPresence(chatId: string, data: SandboxPresenceUpdateInput, startedAt: Date, expiresAt: Date) {
    const persistenceData = {
      activityType: data.activityType,
      statusText: data.statusText,
      locationLabel: data.locationLabel,
      socialContext: data.socialContext,
      interruptibility: data.interruptibility,
      source: data.source,
      priority: data.priority,
      startedAt,
      expiresAt,
      lastReason: data.lastReason ?? 'manual_sandbox_override',
    };

    return this.prisma.roleplayPresenceState.upsert({
      where: { chatId },
      create: {
        chatId,
        ...persistenceData,
      },
      update: persistenceData,
    });
  }

  createMemory(chatId: string, data: SandboxAddMemoryInput) {
    return this.prisma.roleplayMemory.create({
      data: {
        chatId,
        kind: data.kind,
        content: data.content,
        importance: data.importance,
        confidence: 1.0,
        sourceText: 'Manual entry via Sandbox',
      },
    });
  }

  deleteMemory(memoryId: string) {
    return this.prisma.roleplayMemory.delete({
      where: { id: memoryId },
    });
  }
}
