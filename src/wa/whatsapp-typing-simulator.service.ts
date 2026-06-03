import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Chat } from 'whatsapp-web.js';
import { AppEnv } from '../config/env.validation';

@Injectable()
export class WhatsappTypingSimulatorService {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  async simulate(chat: Chat, replyText: string): Promise<void> {
    if (!this.config.get('WHATSAPP_TYPING_ENABLED')) {
      return;
    }

    await chat.sendSeen();
    await chat.sendStateTyping();
    await this.delay(this.calculateDelayMs(replyText));
    await chat.clearState();
  }

  private calculateDelayMs(replyText: string): number {
    const minMs = this.config.get('WHATSAPP_TYPING_MIN_MS');
    const maxMs = this.config.get('WHATSAPP_TYPING_MAX_MS');
    const charsPerSecond = this.config.get('WHATSAPP_TYPING_CHARS_PER_SECOND');
    const estimatedMs = (replyText.length / charsPerSecond) * 1000;

    return Math.round(Math.max(minMs, Math.min(maxMs, estimatedMs)));
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
