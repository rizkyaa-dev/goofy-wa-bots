import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { rm } from 'fs/promises';
import { join, resolve } from 'path';
import qrcode from 'qrcode-terminal';
import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import { BotOrchestratorService } from '../bot/bot-orchestrator.service';
import { BotReply, BotReplyPart, resolveBotReplyParts } from '../bot/domain/bot-reply';
import { AppEnv } from '../config/env.validation';
import { IncomingMessage } from '../messages/domain/incoming-message';
import { BrowserExecutableResolverService } from './browser-executable-resolver.service';
import { WhatsappMessageNormalizerService } from './whatsapp-message-normalizer.service';
import { WhatsappReplyBatcherService } from './whatsapp-reply-batcher.service';
import { WhatsappTypingSimulatorService } from './whatsapp-typing-simulator.service';

export type WhatsappConnectionStatus = 'DISCONNECTED' | 'SCAN_QR' | 'AUTHENTICATING' | 'LOADING' | 'READY';

@Injectable()
export class WhatsappWebClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappWebClientService.name);
  private connectionStatus: WhatsappConnectionStatus = 'DISCONNECTED';
  private lastQrCode: string | null = null;
  private readonly typingUsers = new Map<string, number>();
  private readonly reconnectDelayMs = 5_000;
  private readonly expectedNavigationErrorWindowMs = 15_000;
  private readonly transientNavigationLogCooldownMs = 10_000;
  private readonly unhandledRejectionHandler = (reason: unknown) => {
    this.handleUnhandledRejection(reason);
  };

  private client?: Client;
  private clientGeneration = 0;
  private expectedNavigationErrorUntil = 0;
  private initializing = false;
  private isShuttingDown = false;
  private lastTransientNavigationErrorLoggedAt = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private readonly retiredClients = new WeakSet<Client>();

  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly bot: BotOrchestratorService,
    private readonly normalizer: WhatsappMessageNormalizerService,
    private readonly browserResolver: BrowserExecutableResolverService,
    private readonly replyBatcher: WhatsappReplyBatcherService,
    private readonly typingSimulator: WhatsappTypingSimulatorService,
  ) {}

  async onModuleInit(): Promise<void> {
    process.on('unhandledRejection', this.unhandledRejectionHandler);
    await this.initializeClient();
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    process.off('unhandledRejection', this.unhandledRejectionHandler);
    this.clearReconnectTimer();
    await this.destroyClient(this.client);
    this.client = undefined;
  }

  private async initializeClient(): Promise<void> {
    if (this.isShuttingDown || this.initializing) {
      return;
    }

    this.connectionStatus = 'AUTHENTICATING';
    this.initializing = true;
    const generation = ++this.clientGeneration;
    const client = this.createClient();

    this.client = client;
    this.bindClientEvents(client, generation);

    try {
      await client.initialize();
    } catch (error) {
      if (this.isCurrentClient(client, generation) && !this.isShuttingDown) {
        this.logClientInitializeError(error);
        await this.destroyClient(client);
        this.client = undefined;
        this.scheduleReconnect('initialize_error');
      }
    } finally {
      this.initializing = false;
    }
  }

  private createClient(): Client {
    const browserPath = this.browserResolver.resolve();

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: this.config.get('WHATSAPP_CLIENT_ID'),
        dataPath: this.config.get('WHATSAPP_DATA_PATH'),
        rmMaxRetries: this.config.get('WHATSAPP_SESSION_RM_MAX_RETRIES'),
      }),
      puppeteer: {
        headless: this.config.get('WHATSAPP_HEADLESS'),
        executablePath: browserPath,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    return this.patchClientInjectLifecycle(client);
  }

  private patchClientInjectLifecycle(client: Client): Client {
    const injectableClient = client as InjectableWhatsappClient;
    const originalInject = injectableClient.inject?.bind(client);

    if (!originalInject) {
      return client;
    }

    injectableClient.inject = async () => {
      if (this.retiredClients.has(client) || this.isShuttingDown) {
        return;
      }

      return originalInject();
    };

    return client;
  }

  private bindClientEvents(client: Client, generation: number): void {
    let authenticatedLogged = false;
    let readyLogged = false;

    client.on('qr', (qr) => {
      if (!this.isCurrentClient(client, generation)) {
        return;
      }

      this.connectionStatus = 'SCAN_QR';
      this.lastQrCode = qr;
      this.logger.log('Scan this QR code using WhatsApp mobile app.');
      qrcode.generate(qr, { small: true });
    });

    client.on('authenticated', () => {
      if (!this.isCurrentClient(client, generation) || authenticatedLogged) {
        return;
      }

      this.connectionStatus = 'AUTHENTICATING';
      this.lastQrCode = null;
      authenticatedLogged = true;
      this.logger.log('WhatsApp session authenticated.');
    });

    client.on('ready', () => {
      if (!this.isCurrentClient(client, generation) || readyLogged) {
        return;
      }

      this.connectionStatus = 'READY';
      this.lastQrCode = null;
      readyLogged = true;
      this.logger.log(`WhatsApp client is ready as ${client.info?.wid?._serialized ?? 'unknown account'}.`);
    });

    client.on('loading_screen', (percent, message) => {
      if (!this.isCurrentClient(client, generation)) {
        return;
      }

      this.connectionStatus = 'LOADING';
      this.logger.log(`WhatsApp loading ${percent}%: ${message}`);
    });

    client.on('change_state', (state) => {
      if (!this.isCurrentClient(client, generation)) {
        return;
      }

      this.logger.log(`WhatsApp state changed: ${state}`);
    });

    client.on('auth_failure', (message) => {
      void this.handleAuthFailure(client, generation, message);
    });

    client.on('disconnected', (reason) => {
      void this.handleDisconnected(client, generation, reason);
    });

    client.on('message', (message) => {
      if (!this.isCurrentClient(client, generation)) {
        return;
      }

      void this.handleMessage(message);
    });

    client.on('chat_state_change', (chatState: any) => {
      if (!this.isCurrentClient(client, generation)) {
        return;
      }
      if (chatState.state === 'COMPOSING') {
        this.typingUsers.set(chatState.chatId, Date.now());
      } else {
        this.typingUsers.delete(chatState.chatId);
      }
    });
  }

  private async handleDisconnected(client: Client, generation: number, reason: string): Promise<void> {
    if (!this.isCurrentClient(client, generation)) {
      return;
    }

    this.connectionStatus = 'DISCONNECTED';
    this.lastQrCode = null;
    this.markExpectedNavigationError();
    this.retireClient(client);
    this.logger.warn(`WhatsApp client disconnected: ${reason}`);

    await this.destroyClient(client);

    if (this.isCurrentClient(client, generation)) {
      this.client = undefined;
    }

    if (reason.toUpperCase() === 'LOGOUT') {
      await this.cleanupLocalAuthSession();
    }

    this.scheduleReconnect(reason);
  }

  private async handleAuthFailure(client: Client, generation: number, message: string): Promise<void> {
    if (!this.isCurrentClient(client, generation)) {
      return;
    }

    this.connectionStatus = 'DISCONNECTED';
    this.lastQrCode = null;
    this.markExpectedNavigationError();
    this.retireClient(client);
    this.logger.error(`WhatsApp authentication failed: ${message}`);
    await this.destroyClient(client);

    if (this.isCurrentClient(client, generation)) {
      this.client = undefined;
    }

    await this.cleanupLocalAuthSession();
    this.scheduleReconnect('auth_failure');
  }

  private async handleMessage(message: Message): Promise<void> {
    if (message.fromMe || !message.body.trim()) {
      return;
    }

    this.typingUsers.delete(message.from);

    try {
      const incoming = await this.normalizer.normalize(message);

      if (this.isCommand(incoming.body)) {
        this.replyBatcher.cancel(incoming.chatId);
        const reply = await this.bot.handle(incoming);
        await this.sendReply(incoming, message, reply);
        return;
      }

      this.replyBatcher.enqueue(incoming, message);
    } catch (error) {
      const detail = error instanceof Error ? error.stack ?? error.message : String(error);
      this.logger.error(`Failed to process incoming WhatsApp message: ${detail}`);
    }
  }

  private async sendReply(incoming: IncomingMessage, message: Message, reply: BotReply | null): Promise<void> {
    if (!reply) {
      return;
    }

    const chat = await message.getChat();
    const parts = resolveBotReplyParts(reply);
    const sentParts: BotReplyPart[] = [];

    for (const [index, part] of parts.entries()) {
      if (index === 0) {
        await this.typingSimulator.simulate(chat, part.text);
      } else {
        await this.delay(part.delayMs ?? 0);
      }

      await chat.sendMessage(part.text, this.createSendOptions(part));
      sentParts.push(part);
      await this.recordSentParts(incoming, sentParts);
    }
  }

  private async recordSentParts(incoming: IncomingMessage, sentParts: readonly BotReplyPart[]): Promise<void> {
    try {
      await this.bot.recordSentReply(incoming, sentParts);
    } catch (error) {
      this.logger.warn(`Failed to record sent WhatsApp reply: ${this.getErrorMessage(error)}`);
    }
  }

  private createSendOptions(part: BotReplyPart): { quotedMessageId?: string } | undefined {
    return part.quoteMessageId ? { quotedMessageId: part.quoteMessageId } : undefined;
  }

  private async delay(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private isCommand(body: string): boolean {
    return /^[!/]/u.test(body.trim());
  }

  private scheduleReconnect(reason: string): void {
    if (this.isShuttingDown) {
      return;
    }

    this.clearReconnectTimer();
    this.logger.warn(`Scheduling WhatsApp reconnect in ${this.reconnectDelayMs}ms after ${reason}.`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.initializeClient();
    }, this.reconnectDelayMs);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) {
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private async destroyClient(client?: Client): Promise<void> {
    if (!client) {
      return;
    }

    this.markExpectedNavigationError();
    this.retireClient(client);

    try {
      await client.destroy();
    } catch (error) {
      if (this.isExpectedNavigationError(error)) {
        this.logger.debug(`Ignored WhatsApp client destroy navigation error: ${this.getErrorMessage(error)}`);
        return;
      }

      this.logger.warn(`Failed to destroy WhatsApp client cleanly: ${this.getErrorMessage(error)}`);
    }
  }

  private async cleanupLocalAuthSession(): Promise<void> {
    const sessionPath = this.getLocalAuthSessionPath();

    try {
      await rm(sessionPath, {
        recursive: true,
        force: true,
        maxRetries: this.config.get('WHATSAPP_SESSION_RM_MAX_RETRIES'),
      });
      this.logger.warn(`Removed logged-out WhatsApp session at ${sessionPath}. A new QR code will be generated.`);
    } catch (error) {
      this.logger.warn(`Failed to remove logged-out WhatsApp session at ${sessionPath}: ${this.getErrorMessage(error)}`);
    }
  }

  private getLocalAuthSessionPath(): string {
    const dataPath = resolve(this.config.get('WHATSAPP_DATA_PATH'));
    const clientId = this.config.get('WHATSAPP_CLIENT_ID');
    const sessionDirectory = clientId ? `session-${clientId}` : 'session';

    return join(dataPath, sessionDirectory);
  }

  private isCurrentClient(client: Client, generation: number): boolean {
    return this.client === client && this.clientGeneration === generation && !this.isShuttingDown;
  }

  private markExpectedNavigationError(): void {
    this.expectedNavigationErrorUntil = Date.now() + this.expectedNavigationErrorWindowMs;
  }

  private handleUnhandledRejection(reason: unknown): void {
    if (this.isExpectedNavigationError(reason)) {
      this.logTransientNavigationError(reason);
      return;
    }

    if (this.isWhatsappNavigationError(reason)) {
      this.logTransientNavigationError(reason);
      return;
    }

    this.logger.error(`Unhandled promise rejection: ${this.getErrorDetail(reason)}`);
  }

  private logClientInitializeError(error: unknown): void {
    if (this.isExpectedNavigationError(error)) {
      this.logger.warn(`WhatsApp client initialization interrupted by navigation: ${this.getErrorMessage(error)}`);
      return;
    }

    this.logger.error(`Failed to initialize WhatsApp client: ${this.getErrorDetail(error)}`);
  }

  private isExpectedNavigationError(error: unknown): boolean {
    if (Date.now() > this.expectedNavigationErrorUntil) {
      return false;
    }

    return this.isWhatsappNavigationError(error);
  }

  private isWhatsappNavigationError(error: unknown): boolean {
    const message = this.getErrorMessage(error);

    return (
      message.includes('Execution context was destroyed') ||
      message.includes('Cannot find context with specified id') ||
      message.includes('Navigating frame was detached') ||
      message.includes('Attempted to use detached Frame') ||
      (message.includes('Protocol error') && message.includes('Target closed'))
    );
  }

  private logTransientNavigationError(error: unknown): void {
    const now = Date.now();

    if (now - this.lastTransientNavigationErrorLoggedAt < this.transientNavigationLogCooldownMs) {
      return;
    }

    this.lastTransientNavigationErrorLoggedAt = now;
    this.logger.warn(`Ignored transient WhatsApp Web navigation error: ${this.getErrorMessage(error)}`);
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private getErrorDetail(error: unknown): string {
    return error instanceof Error ? error.stack ?? error.message : String(error);
  }

  private retireClient(client: Client): void {
    this.retiredClients.add(client);
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    if (!this.client || this.connectionStatus !== 'READY') {
      throw new Error('WhatsApp client is not ready.');
    }

    try {
      const chat = await this.client.getChatById(chatId);
      await this.typingSimulator.simulate(chat, text);
      await chat.sendMessage(text);
    } catch (error) {
      this.logger.error(`Failed to send proactive message to ${chatId}: ${this.getErrorMessage(error)}`);
      throw error;
    }
  }

  isUserTyping(chatId: string): boolean {
    const lastTyping = this.typingUsers.get(chatId);
    if (!lastTyping) {
      return false;
    }
    // Consider active composing expired after 2 minutes (120,000 ms)
    if (Date.now() - lastTyping < 120_000) {
      return true;
    }
    this.typingUsers.delete(chatId);
    return false;
  }

  getConnectionStatus(): WhatsappConnectionStatus {
    return this.connectionStatus;
  }

  getLastQrCode(): string | null {
    return this.lastQrCode;
  }

  async restartClient(): Promise<void> {
    this.logger.log('Force restarting WhatsApp client via dashboard...');
    this.connectionStatus = 'DISCONNECTED';
    this.lastQrCode = null;
    this.clearReconnectTimer();

    if (this.client) {
      this.retireClient(this.client);
      await this.destroyClient(this.client);
      this.client = undefined;
    }

    await this.cleanupLocalAuthSession();
    await this.initializeClient();
  }
}

type InjectableWhatsappClient = Client & {
  inject?: () => Promise<void>;
};
