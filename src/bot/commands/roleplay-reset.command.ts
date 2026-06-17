import { Injectable } from '@nestjs/common';
import { RoleplayResetScope, RoleplayResetService } from '../../roleplay/state/roleplay-reset.service';
import { BotReply } from '../domain/bot-reply';
import { CommandContext } from '../domain/command-context';
import { CommandHandler } from '../domain/command-handler';

const scopes: RoleplayResetScope[] = ['all', 'state', 'memory', 'history'];

@Injectable()
export class RoleplayResetCommand implements CommandHandler {
  readonly command = 'rp_reset';
  readonly description = 'Reset roleplay state, memory, atau history chat ini.';

  constructor(private readonly roleplayReset: RoleplayResetService) {}

  async handle(context: CommandContext): Promise<BotReply> {
    const scope = (context.args[0]?.toLowerCase() || 'all') as RoleplayResetScope;

    if (!scopes.includes(scope)) {
      return {
        text: `Scope tidak valid. Pilihan: ${scopes.join(', ')}.`,
      };
    }

    const result = await this.roleplayReset.reset(context.message.chatId, scope);

    return {
      text: [
        `Roleplay reset (${scope}) selesai.`,
        `State: ${result.state}`,
        `Presence: ${result.presence}`,
        `Memory: ${result.memories}`,
        `History: ${result.history}`,
      ].join('\n'),
    };
  }
}
