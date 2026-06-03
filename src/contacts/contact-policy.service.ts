import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnv } from '../config/env.validation';
import { IncomingMessage } from '../messages/domain/incoming-message';

@Injectable()
export class ContactPolicyService {
  private readonly allowedChatIds: ReadonlySet<string>;

  constructor(private readonly config: ConfigService<AppEnv, true>) {
    const allowed = this.parseCsv(config.get('BOT_ALLOWED_NUMBERS'));
    const owner = config.get('BOT_OWNER_NUMBER').trim();

    this.allowedChatIds = new Set(allowed.length > 0 ? allowed : owner ? [owner] : []);
  }

  canRespondTo(message: IncomingMessage): boolean {
    if (this.allowedChatIds.size === 0) {
      return true;
    }

    return message.chatIdAliases.some((chatId) => this.allowedChatIds.has(chatId));
  }

  private parseCsv(value: string): string[] {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
}
