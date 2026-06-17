import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

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
    const patch = {
      ...statePatch,
      mood: statePatch.mood as any,
    };
    return this.prisma.roleplayState.upsert({
      where: { chatId },
      update: {
        ...patch,
        lastInteractionAt: new Date(),
      },
      create: {
        chatId,
        ...patch,
        lastInteractionAt: new Date(),
      },
    });
  }
}

type StatePatch = {
  mood:
    | 'neutral'
    | 'happy'
    | 'sad'
    | 'annoyed'
    | 'warm'
    | 'playful'
    | 'sleepy'
    | 'excited'
    | 'jealous'
    | 'worried'
    | 'swing'
    | 'sensual'
    | 'flirty'
    | 'aroused'
    | 'needy';
  affection: number;
  trust: number;
  energy: number;
  tension: number;
  intimacy: number;
  shyness: number;
  curiosity: number;
  volatility: number;
  desire: number;
  inhibition: number;
  comfort: number;
  compliance: number;
};
