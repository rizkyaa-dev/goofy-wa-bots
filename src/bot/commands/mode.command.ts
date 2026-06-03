import { Injectable } from '@nestjs/common';
import { BotMode } from '@prisma/client';
import { ContactSettingsRepository } from '../../contacts/contact-settings.repository';
import { BotReply } from '../domain/bot-reply';
import { CommandContext } from '../domain/command-context';
import { CommandHandler } from '../domain/command-handler';

const modes = Object.values(BotMode);

@Injectable()
export class ModeCommand implements CommandHandler {
  readonly command = 'mode';
  readonly description = 'Lihat atau ubah mode: command_only, auto_reply, silent.';

  constructor(private readonly contactSettings: ContactSettingsRepository) {}

  async handle(context: CommandContext): Promise<BotReply> {
    const requestedMode = context.args[0] as BotMode | undefined;

    if (!requestedMode) {
      return {
        text: `Mode sekarang: ${context.settings.mode}. Pilihan: ${modes.join(', ')}.`,
      };
    }

    if (!modes.includes(requestedMode)) {
      return {
        text: `Mode tidak valid. Pilihan: ${modes.join(', ')}.`,
      };
    }

    const updated = await this.contactSettings.setMode(context.message.chatId, requestedMode);

    return {
      text: `Mode diubah ke ${updated.mode}.`,
    };
  }
}
