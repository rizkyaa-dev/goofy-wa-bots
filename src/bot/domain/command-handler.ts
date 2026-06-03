import { BotReply } from './bot-reply';
import { CommandContext } from './command-context';

export interface CommandHandler {
  readonly command: string;
  readonly description: string;
  handle(context: CommandContext): Promise<BotReply>;
}
