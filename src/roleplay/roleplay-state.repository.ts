import { Injectable } from '@nestjs/common';
import { PrismaService } from '../infra/prisma/prisma.service';

@Injectable()
export class RoleplayStateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreate(chatId: string) {
    return this.prisma.roleplayState.upsert({
      where: { chatId },
      update: {},
      create: { chatId },
    });
  }

  async updateAfterInbound(chatId: string, statePatch: StatePatch) {
    return this.prisma.roleplayState.upsert({
      where: { chatId },
      update: {
        ...statePatch,
        lastInteractionAt: new Date(),
      },
      create: {
        chatId,
        ...statePatch,
        lastInteractionAt: new Date(),
      },
    });
  }
}

type StatePatch = {
  mood: 'neutral' | 'happy' | 'sad' | 'annoyed' | 'warm' | 'playful';
  affection: number;
  trust: number;
  energy: number;
  tension: number;
  intimacy: number;
  shyness: number;
};
