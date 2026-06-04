import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Message } from 'whatsapp-web.js';
import { BotOrchestratorService } from '../bot/bot-orchestrator.service';
import { BotReply } from '../bot/domain/bot-reply';
import { AppEnv } from '../config/env.validation';
import { IncomingMessage } from '../messages/domain/incoming-message';
import { WhatsappTypingSimulatorService } from './whatsapp-typing-simulator.service';

type QueuedMessage = {
  incoming: IncomingMessage;
  source: Message;
};

type BatchState = {
  messages: QueuedMessage[];
  firstQueuedAt: number;
  version: number;
  timer?: ReturnType<typeof setTimeout>;
};

@Injectable()
export class WhatsappReplyBatcherService implements OnModuleDestroy {
  private readonly logger = new Logger(WhatsappReplyBatcherService.name);
  private readonly states = new Map<string, BatchState>();

  constructor(
    private readonly bot: BotOrchestratorService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly typingSimulator: WhatsappTypingSimulatorService,
  ) {}

  onModuleDestroy(): void {
    for (const state of this.states.values()) {
      this.clearTimer(state);
    }

    this.states.clear();
  }

  enqueue(incoming: IncomingMessage, source: Message): void {
    if (!this.config.get('BOT_REPLY_BATCHING_ENABLED')) {
      void this.processImmediate(incoming, source);
      return;
    }

    const state = this.getOrCreateState(incoming.chatId);
    if (state.messages.length === 0) {
      state.firstQueuedAt = Date.now();
    }

    state.version += 1;
    state.messages.push({ incoming, source });

    this.scheduleFlush(incoming.chatId, state);
  }

  cancel(chatId: string): void {
    const state = this.states.get(chatId);

    if (!state) {
      return;
    }

    this.clearTimer(state);
    this.states.delete(chatId);
  }

  private async processImmediate(incoming: IncomingMessage, source: Message): Promise<void> {
    try {
      const reply = await this.bot.handleBatch([incoming]);
      await this.sendReply(source, reply);
    } catch (error) {
      this.logError('Failed to process immediate WhatsApp reply', error);
    }
  }

  private getOrCreateState(chatId: string): BatchState {
    const existing = this.states.get(chatId);

    if (existing) {
      return existing;
    }

    const state: BatchState = {
      messages: [],
      firstQueuedAt: Date.now(),
      version: 0,
    };
    this.states.set(chatId, state);
    return state;
  }

  private scheduleFlush(chatId: string, state: BatchState): void {
    this.clearTimer(state);

    const delayMs = state.messages.length >= this.config.get('BOT_REPLY_BATCH_MAX_MESSAGES') ? 0 : this.calculateDelayMs(state);
    const scheduledVersion = state.version;

    state.timer = setTimeout(() => {
      void this.flush(chatId, scheduledVersion);
    }, delayMs);
  }

  private async flush(chatId: string, scheduledVersion: number): Promise<void> {
    const state = this.states.get(chatId);

    if (!state || state.version !== scheduledVersion || state.messages.length === 0) {
      return;
    }

    const batch = state.messages;
    const anchor = batch.at(-1) as QueuedMessage;
    state.messages = [];
    this.clearTimer(state);

    try {
      const reply = await this.bot.handleBatch(batch.map((message) => message.incoming));

      if (!this.isCurrent(chatId, scheduledVersion)) {
        return;
      }

      await this.sendReply(anchor.source, reply, () => this.isCurrent(chatId, scheduledVersion));
    } catch (error) {
      this.logError('Failed to process batched WhatsApp reply', error);
    } finally {
      this.finishFlush(chatId, scheduledVersion);
    }
  }

  private finishFlush(chatId: string, flushedVersion: number): void {
    const state = this.states.get(chatId);

    if (!state) {
      return;
    }

    if (state.messages.length > 0) {
      this.scheduleFlush(chatId, state);
      return;
    }

    if (state.version === flushedVersion) {
      this.states.delete(chatId);
    }
  }

  private async sendReply(source: Message, reply: BotReply | null, shouldContinue: () => boolean = () => true): Promise<void> {
    if (!reply || !shouldContinue()) {
      return;
    }

    const chat = await source.getChat();
    const typingCompleted = await this.typingSimulator.simulate(chat, reply.text, shouldContinue);

    if (!typingCompleted || !shouldContinue()) {
      return;
    }

    await chat.sendMessage(reply.text, this.createSendOptions(reply));
  }

  private createSendOptions(reply: BotReply): { quotedMessageId?: string } | undefined {
    return reply.quoteMessageId ? { quotedMessageId: reply.quoteMessageId } : undefined;
  }

  private calculateDelayMs(state: BatchState): number {
    const now = Date.now();
    const latestMessage = state.messages.at(-1)?.incoming.body ?? '';
    const quietMs = this.calculateQuietMs(latestMessage, state.messages.length);
    const maxWaitMs = this.config.get('BOT_REPLY_MAX_WAIT_MS');
    const remainingMaxWaitMs = Math.max(0, state.firstQueuedAt + maxWaitMs - now);

    return Math.min(quietMs, remainingMaxWaitMs);
  }

  private calculateQuietMs(latestMessage: string, batchSize: number): number {
    const normalized = latestMessage.trim();

    if (this.looksIncomplete(normalized)) {
      return this.config.get('BOT_REPLY_FRAGMENT_QUIET_MS');
    }

    if (normalized.length >= 140 || batchSize >= 3) {
      return this.config.get('BOT_REPLY_LONG_TEXT_QUIET_MS');
    }

    return this.config.get('BOT_REPLY_MIN_QUIET_MS');
  }

  private looksIncomplete(text: string): boolean {
    if (text.length <= 8 && !/[?.!]$/u.test(text)) {
      return true;
    }

    return /(?:,|\b(?:dan|atau|terus|trus|tapi|karena|soalnya|btw|eh|jadi|kalau|kalo))$/iu.test(text);
  }

  private isCurrent(chatId: string, version: number): boolean {
    const state = this.states.get(chatId);
    return !state || state.version === version;
  }

  private clearTimer(state: BatchState): void {
    if (!state.timer) {
      return;
    }

    clearTimeout(state.timer);
    state.timer = undefined;
  }

  private logError(message: string, error: unknown): void {
    const detail = error instanceof Error ? error.stack ?? error.message : String(error);
    this.logger.error(`${message}: ${detail}`);
  }
}
