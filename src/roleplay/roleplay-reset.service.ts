import { Injectable } from '@nestjs/common';
import { PrismaService } from '../infra/prisma/prisma.service';

@Injectable()
export class RoleplayResetService {
  constructor(private readonly prisma: PrismaService) {}

  async reset(chatId: string, scope: RoleplayResetScope): Promise<RoleplayResetResult> {
    const shouldResetState = scope === 'all' || scope === 'state';
    const shouldResetMemory = scope === 'all' || scope === 'memory';
    const shouldResetHistory = scope === 'all' || scope === 'history';

    return this.prisma.$transaction(async (tx) => {
      const state = shouldResetState ? await tx.roleplayState.deleteMany({ where: { chatId } }) : { count: 0 };
      const memories = shouldResetMemory ? await tx.roleplayMemory.deleteMany({ where: { chatId } }) : { count: 0 };
      const history = shouldResetHistory ? await tx.conversationMessage.deleteMany({ where: { chatId } }) : { count: 0 };

      return {
        state: state.count,
        memories: memories.count,
        history: history.count,
      };
    });
  }
}

export type RoleplayResetScope = 'all' | 'state' | 'memory' | 'history';

export type RoleplayResetResult = {
  state: number;
  memories: number;
  history: number;
};
