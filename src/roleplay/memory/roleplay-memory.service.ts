import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoleplayMemoryKind } from '@prisma/client';
import { AppEnv } from '../../config/env.validation';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { IncomingMessage } from '../../messages/domain/incoming-message';

@Injectable()
export class RoleplayMemoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async retrieve(chatId: string) {
    return this.prisma.roleplayMemory.findMany({
      where: { chatId },
      orderBy: [{ importance: 'desc' }, { updatedAt: 'desc' }],
      take: this.config.get('ROLEPLAY_MEMORY_LIMIT'),
    });
  }

  async captureFromInbound(message: IncomingMessage): Promise<void> {
    const candidate = this.extractMemoryCandidate(message.body);

    if (!candidate) {
      return;
    }

    await this.prisma.roleplayMemory.create({
      data: {
        chatId: message.chatId,
        kind: candidate.kind,
        content: candidate.content,
        importance: candidate.importance,
      },
    });
  }

  private extractMemoryCandidate(text: string): MemoryCandidate | null {
    const normalized = text.trim();
    const lower = normalized.toLowerCase();

    if (normalized.length < 8 || normalized.length > 240) {
      return null;
    }

    if (lower.includes('namaku') || lower.includes('nama aku') || lower.includes('panggil aku')) {
      return {
        kind: RoleplayMemoryKind.user_fact,
        content: normalized,
        importance: 85,
      };
    }

    if (lower.includes('aku suka') || lower.includes('aku nggak suka') || lower.includes('aku tidak suka')) {
      return {
        kind: RoleplayMemoryKind.preference,
        content: normalized,
        importance: 75,
      };
    }

    if (lower.includes('ingat') || lower.includes('jangan lupa')) {
      return {
        kind: RoleplayMemoryKind.episode,
        content: normalized,
        importance: 70,
      };
    }

    return null;
  }
}

type MemoryCandidate = {
  kind: RoleplayMemoryKind;
  content: string;
  importance: number;
};
