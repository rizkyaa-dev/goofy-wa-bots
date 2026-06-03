import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnv } from '../config/env.validation';
import { IncomingMessage } from '../messages/domain/incoming-message';
import { BotReply } from './domain/bot-reply';

@Injectable()
export class TemporaryGreetingReplyService {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  createReply(message: IncomingMessage): BotReply | null {
    if (!this.config.get('TEMP_HAI_REPLY_ENABLED')) {
      return null;
    }

    if (message.body.trim().toLowerCase() !== 'hai') {
      return null;
    }

    return {
      text: 'iya ada yg bisa saya bantu.',
    };
  }
}
