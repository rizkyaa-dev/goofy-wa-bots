import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import qrcode from 'qrcode-terminal';
import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import { BotOrchestratorService } from '../bot/bot-orchestrator.service';
import { AppEnv } from '../config/env.validation';
import { BrowserExecutableResolverService } from './browser-executable-resolver.service';
import { WhatsappMessageNormalizerService } from './whatsapp-message-normalizer.service';
import { WhatsappTypingSimulatorService } from './whatsapp-typing-simulator.service';

@Injectable()
export class WhatsappWebClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappWebClientService.name);
  private client?: Client;

  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly bot: BotOrchestratorService,
    private readonly normalizer: WhatsappMessageNormalizerService,
    private readonly browserResolver: BrowserExecutableResolverService,
    private readonly typingSimulator: WhatsappTypingSimulatorService,
  ) {}

  async onModuleInit(): Promise<void> {
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

    client.on('qr', (qr) => {
      this.logger.log('Scan this QR code using WhatsApp mobile app.');
      qrcode.generate(qr, { small: true });
    });

    client.on('authenticated', () => {
      this.logger.log('WhatsApp session authenticated.');
    });

    client.on('ready', () => {
      this.logger.log(`WhatsApp client is ready as ${client.info?.wid?._serialized ?? 'unknown account'}.`);
    });

    client.on('loading_screen', (percent, message) => {
      this.logger.log(`WhatsApp loading ${percent}%: ${message}`);
    });

    client.on('change_state', (state) => {
      this.logger.log(`WhatsApp state changed: ${state}`);
    });

    client.on('auth_failure', (message) => {
      this.logger.error(`WhatsApp authentication failed: ${message}`);
    });

    client.on('disconnected', (reason) => {
      this.logger.warn(`WhatsApp client disconnected: ${reason}`);
    });

    client.on('message', (message) => {
      void this.handleMessage(message);
    });

    this.client = client;
    await client.initialize();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) {
      return;
    }

    await this.client.destroy();
  }

  private async handleMessage(message: Message): Promise<void> {
    if (message.fromMe || !message.body.trim()) {
      return;
    }

    try {
      const incoming = await this.normalizer.normalize(message);
      const reply = await this.bot.handle(incoming);

      if (reply) {
        const chat = await message.getChat();
        await this.typingSimulator.simulate(chat, reply.text);
        await chat.sendMessage(reply.text);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.stack ?? error.message : String(error);
      this.logger.error(`Failed to process incoming WhatsApp message: ${detail}`);
    }
  }
}
