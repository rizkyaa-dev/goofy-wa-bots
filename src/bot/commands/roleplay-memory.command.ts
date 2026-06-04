import { Injectable } from '@nestjs/common';
import { RoleplayMemoryService } from '../../roleplay/memory/roleplay-memory.service';
import { BotReply } from '../domain/bot-reply';
import { CommandContext } from '../domain/command-context';
import { CommandHandler } from '../domain/command-handler';

@Injectable()
export class RoleplayMemoryCommand implements CommandHandler {
  readonly command = 'rp_memory';
  readonly description = 'Lihat memory roleplay chat ini.';

  constructor(private readonly memories: RoleplayMemoryService) {}

  async handle(context: CommandContext): Promise<BotReply> {
    const memories = await this.memories.list(context.message.chatId);

    if (memories.length === 0) {
      return {
        text: 'Memory roleplay masih kosong.',
      };
    }

    return {
      text: memories.map((memory, index) => `${index + 1}. [${memory.kind}] ${memory.content}`).join('\n'),
    };
  }
}
