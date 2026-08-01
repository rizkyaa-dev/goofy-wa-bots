import { Injectable } from '@nestjs/common';
import { LlmTokenUsage } from '../llm/domain/llm.types';
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
    const tokenUsage = await this.prisma.sandboxTokenUsage.findUnique({
      where: { chatId },
    });

    return {
      state,
      presence,
      memories,
      messages: messages.reverse(),
      tokenUsage: tokenUsage ? this.toTokenUsage(tokenUsage) : this.emptyTokenUsage(),
    };
  }

  async accumulateTokenUsage(chatId: string, usage: LlmTokenUsage | undefined): Promise<LlmTokenUsage> {
    const normalized = this.normalizeTokenUsage(usage);

    if (!normalized) {
      const current = await this.prisma.sandboxTokenUsage.findUnique({ where: { chatId } });
      return current ? this.toTokenUsage(current) : this.emptyTokenUsage();
    }

    const tokenUsage = await this.prisma.sandboxTokenUsage.upsert({
      where: { chatId },
      create: {
        chatId,
        ...normalized,
      },
      update: {
        inputTokens: { increment: normalized.inputTokens },
        outputTokens: { increment: normalized.outputTokens },
        totalTokens: { increment: normalized.totalTokens },
      },
    });

    return this.toTokenUsage(tokenUsage);
  }

  resetTokenUsage(chatId: string) {
    return this.prisma.sandboxTokenUsage.deleteMany({ where: { chatId } });
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

  private normalizeTokenUsage(usage: LlmTokenUsage | undefined): Required<LlmTokenUsage> | null {
    const inputTokens = this.normalizeTokenCount(usage?.inputTokens);
    const outputTokens = this.normalizeTokenCount(usage?.outputTokens);
    const totalTokens = this.normalizeTokenCount(usage?.totalTokens);

    if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) {
      return null;
    }

    return {
      inputTokens: inputTokens ?? 0,
      outputTokens: outputTokens ?? 0,
      totalTokens: totalTokens ?? (inputTokens ?? 0) + (outputTokens ?? 0),
    };
  }

  private normalizeTokenCount(value: number | undefined): number | undefined {
    return Number.isFinite(value) ? Math.max(0, Math.round(value as number)) : undefined;
  }

  private toTokenUsage(usage: { inputTokens: number; outputTokens: number; totalTokens: number }): Required<LlmTokenUsage> {
    return {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    };
  }

  private emptyTokenUsage(): Required<LlmTokenUsage> {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }
}
