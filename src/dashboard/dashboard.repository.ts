import { Injectable } from '@nestjs/common';
import { BotMode, Prisma, RoleplayMood } from '@prisma/client';
import { PrismaService } from '../infra/prisma/prisma.service';
import { AddContactMemoryInput, UpdateContactRoleplayStateInput } from './dashboard.validation';

@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  countContacts(): Promise<number> {
    return this.prisma.contactSetting.count();
  }

  countAutoReplyContacts(): Promise<number> {
    return this.prisma.contactSetting.count({
      where: { mode: BotMode.auto_reply },
    });
  }

  findContacts() {
    return this.prisma.contactSetting.findMany({
      include: {
        roleplayState: true,
        roleplayPresenceState: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  findMemories(chatId: string) {
    return this.prisma.roleplayMemory.findMany({
      where: { chatId },
      orderBy: [
        { kind: 'asc' },
        { importance: 'desc' },
      ],
    });
  }

  async ensureContactSetting(chatId: string, defaultMode: BotMode) {
    return this.prisma.contactSetting.upsert({
      where: { chatId },
      update: {},
      create: {
        chatId,
        mode: defaultMode,
      },
    });
  }

  createMemory(chatId: string, data: AddContactMemoryInput) {
    return this.prisma.roleplayMemory.create({
      data: {
        chatId,
        kind: data.kind,
        content: data.content,
        importance: data.importance,
        confidence: 1.0,
        sourceText: 'Manual entry via Dashboard',
      },
    });
  }

  deleteMemory(memoryId: string) {
    return this.prisma.roleplayMemory.delete({
      where: { id: memoryId },
    });
  }

  upsertContactMode(chatId: string, mode: BotMode) {
    return this.prisma.contactSetting.upsert({
      where: { chatId },
      update: { mode },
      create: {
        chatId,
        mode,
      },
    });
  }

  upsertRoleplayState(chatId: string, data: UpdateContactRoleplayStateInput) {
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

  isKnownNotFoundError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
  }
}
