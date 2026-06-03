import { Injectable } from '@nestjs/common';
import { BotReply } from '../domain/bot-reply';
import { CommandContext } from '../domain/command-context';
import { CommandHandler } from '../domain/command-handler';

@Injectable()
export class PingCommand implements CommandHandler {
  readonly command = 'ping';
  readonly description = 'Cek bot aktif.';

  async handle(_context: CommandContext): Promise<BotReply> {
    return { text: 'pong' };
  }
}
