import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Chat } from 'whatsapp-web.js';
import { AppEnv } from '../config/env.validation';

@Injectable()
export class WhatsappTypingSimulatorService {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  async simulate(chat: Chat, replyText: string, shouldContinue: () => boolean = () => true): Promise<boolean> {
    if (!this.config.get('WHATSAPP_TYPING_ENABLED')) {
      return shouldContinue();
    }

    if (!shouldContinue()) {
      return false;
    }

    await chat.sendSeen();
    await chat.sendStateTyping();
    const completed = await this.delay(this.calculateDelayMs(replyText), shouldContinue);
    await chat.clearState();

    return completed && shouldContinue();
  }

  private calculateDelayMs(replyText: string): number {
    const minMs = this.config.get('WHATSAPP_TYPING_MIN_MS');
    const maxMs = this.config.get('WHATSAPP_TYPING_MAX_MS');
    const charsPerSecond = this.config.get('WHATSAPP_TYPING_CHARS_PER_SECOND');
    const estimatedMs = (replyText.length / charsPerSecond) * 1000;

    return Math.round(Math.max(minMs, Math.min(maxMs, estimatedMs)));
  }

  private async delay(ms: number, shouldContinue: () => boolean): Promise<boolean> {
    const stepMs = 250;
    let elapsedMs = 0;

    while (elapsedMs < ms) {
      if (!shouldContinue()) {
        return false;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, Math.min(stepMs, ms - elapsedMs));
      });
      elapsedMs += stepMs;
    }

    return shouldContinue();
  }
}
