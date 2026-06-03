import { Injectable } from '@nestjs/common';
import { ContactSettingsRepository } from '../../contacts/contact-settings.repository';
import { BotReply } from '../domain/bot-reply';
import { CommandContext } from '../domain/command-context';
import { CommandHandler } from '../domain/command-handler';

@Injectable()
export class ModelCommand implements CommandHandler {
  readonly command = 'model';
  readonly description = 'Lihat atau ubah model AI chat ini.';

  constructor(private readonly contactSettings: ContactSettingsRepository) {}

  async handle(context: CommandContext): Promise<BotReply> {
    const model = context.rawArgs.trim();

    if (!model) {
      return {
        text: [`Model chat: ${context.settings.llmModel ?? 'default provider'}`, 'Reset: /model default'].join('\n'),
      };
    }

    if (model.toLowerCase() === 'default') {
      await this.contactSettings.setLlmModel(context.message.chatId, null);
      return {
        text: 'Model chat direset ke default provider.',
      };
    }

    const updated = await this.contactSettings.setLlmModel(context.message.chatId, model);

    return {
      text: `Model chat diset ke ${updated.llmModel}.`,
    };
  }
}
