import { Injectable } from '@nestjs/common';
import { ContactSettingsRepository } from '../../contacts/contact-settings.repository';
import { BotReply } from '../domain/bot-reply';
import { CommandContext } from '../domain/command-context';
import { CommandHandler } from '../domain/command-handler';

@Injectable()
export class PersonaCommand implements CommandHandler {
  readonly command = 'persona';
  readonly description = 'Lihat, set, atau hapus persona chat ini.';

  constructor(private readonly contactSettings: ContactSettingsRepository) {}

  async handle(context: CommandContext): Promise<BotReply> {
    const rawArgs = context.rawArgs.trim();

    if (!rawArgs) {
      return {
        text: `Persona sekarang: ${context.settings.persona ?? 'belum diset'}.`,
      };
    }

    if (rawArgs.toLowerCase() === 'reset') {
      await this.contactSettings.setPersona(context.message.chatId, null);
      return {
        text: 'Persona dihapus.',
      };
    }

    const updated = await this.contactSettings.setPersona(context.message.chatId, rawArgs);

    return {
      text: `Persona diset: ${updated.persona}`,
    };
  }
}
