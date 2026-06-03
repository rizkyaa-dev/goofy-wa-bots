import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContactSettingsRepository } from '../../contacts/contact-settings.repository';
import { AppEnv } from '../../config/env.validation';
import { LlmService } from '../../llm/llm.service';
import { BotReply } from '../domain/bot-reply';
import { CommandContext } from '../domain/command-context';
import { CommandHandler } from '../domain/command-handler';

@Injectable()
export class ProviderCommand implements CommandHandler {
  readonly command = 'provider';
  readonly description = 'Lihat atau ubah provider AI chat ini.';

  constructor(
    private readonly contactSettings: ContactSettingsRepository,
    private readonly llm: LlmService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async handle(context: CommandContext): Promise<BotReply> {
    const providerName = context.rawArgs.trim().toLowerCase();
    const supportedProviders = this.llm.getSupportedProviders();

    if (!providerName) {
      return {
        text: [
          `Provider chat: ${context.settings.llmProvider ?? 'default'}`,
          `Provider default: ${this.config.get('LLM_PROVIDER')}`,
          `Pilihan: ${supportedProviders.join(', ')}`,
          'Reset: /provider default',
        ].join('\n'),
      };
    }

    if (providerName === 'default') {
      await this.contactSettings.setLlmProvider(context.message.chatId, null);
      return {
        text: `Provider chat direset ke default (${this.config.get('LLM_PROVIDER')}).`,
      };
    }

    if (!this.llm.hasProvider(providerName)) {
      return {
        text: `Provider tidak didukung. Pilihan: ${supportedProviders.join(', ')}.`,
      };
    }

    const updated = await this.contactSettings.setLlmProvider(context.message.chatId, providerName);

    return {
      text: `Provider chat diset ke ${updated.llmProvider}.`,
    };
  }
}
