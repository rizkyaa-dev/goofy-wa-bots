import { Inject, Injectable } from '@nestjs/common';
import { BotReply } from './domain/bot-reply';
import { CommandContext } from './domain/command-context';
import { CommandHandler } from './domain/command-handler';
import { COMMAND_HANDLERS } from './tokens';

@Injectable()
export class CommandRegistryService {
  private readonly handlers: ReadonlyMap<string, CommandHandler>;

  constructor(@Inject(COMMAND_HANDLERS) handlers: CommandHandler[]) {
    this.handlers = new Map(handlers.map((handler) => [handler.command, handler]));
  }

  list(): readonly CommandHandler[] {
    return Array.from(this.handlers.values());
  }

  async execute(context: CommandContext): Promise<BotReply | null> {
    const [rawCommand, ...args] = this.tokenize(context.message.body);
    const command = rawCommand?.replace(/^[!/]/, '').toLowerCase();

    if (!command) {
      return null;
    }

    const handler = this.handlers.get(command);
    if (!handler) {
      return {
        text: `Command /${command} belum tersedia. Ketik /help untuk daftar command.`,
      };
    }

    return handler.handle({
      ...context,
      args,
      rawArgs: args.join(' '),
    });
  }

  isCommand(body: string): boolean {
    return body.startsWith('/') || body.startsWith('!');
  }

  private tokenize(body: string): string[] {
    return body.trim().split(/\s+/).filter(Boolean);
  }
}
