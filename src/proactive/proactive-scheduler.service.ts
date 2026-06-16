import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../infra/prisma/prisma.service';
import { WhatsappWebClientService } from '../wa/whatsapp-web-client.service';
import { LlmService } from '../llm/llm.service';
import { CharacterProfileService } from '../roleplay/identity/character-profile.service';
import { RoleplayMemoryService } from '../roleplay/memory/roleplay-memory.service';
import { ProactivePromptCompilerService } from './proactive-prompt-compiler.service';
import { AppEnv } from '../config/env.validation';

@Injectable()
export class ProactiveSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProactiveSchedulerService.name);
  private checkTimer?: NodeJS.Timeout;
  private startupTimer?: NodeJS.Timeout;
  private isCheckingInitiatives = false;
  private readonly activeTriggerKeys = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly waClient: WhatsappWebClientService,
    private readonly llm: LlmService,
    private readonly characterProfile: CharacterProfileService,
    private readonly memories: RoleplayMemoryService,
    private readonly promptCompiler: ProactivePromptCompilerService,
  ) {}

  onModuleInit() {
    const enabled = this.config.get('PROACTIVE_ENABLED');
    if (!enabled) {
      this.logger.log('Proactive messaging is disabled in configuration.');
      return;
    }

    const intervalMins = this.config.get('PROACTIVE_CHECK_INTERVAL_MINS');
    const intervalMs = intervalMins * 60 * 1000;

    this.logger.log(`Initializing proactive scheduler. Running check every ${intervalMins} minute(s).`);

    // Run first check after a short delay to let systems settle.
    this.startupTimer = setTimeout(() => {
      this.startupTimer = undefined;
      void this.runInitiativesCycle();
    }, 30000);
  }

  onModuleDestroy() {
    this.clearStartupTimer();
    this.clearCheckTimer();
  }

  async checkInitiatives(): Promise<void> {
    if (this.isCheckingInitiatives) {
      this.logger.warn('Skipping proactive check because a previous cycle is still running.');
      return;
    }

    this.isCheckingInitiatives = true;

    try {
      const status = this.waClient.getConnectionStatus();
      if (status !== 'READY') {
        this.logger.debug(`Skipping proactive checks: WhatsApp client is not READY (current: ${status})`);
        return;
      }

      const activeContacts = await this.prisma.contactSetting.findMany({
        where: { mode: 'auto_reply' },
        include: { roleplayState: true },
      });

      for (const contact of activeContacts) {
        await this.evaluateContact(contact);
      }
    } catch (error) {
      this.logger.error(`Error in checkInitiatives cycle: ${error instanceof Error ? error.stack : error}`);
    } finally {
      this.isCheckingInitiatives = false;
    }
  }

  private async evaluateContact(contact: any): Promise<void> {
    const chatId = contact.chatId;
    const now = new Date();

    // 1. Get or create RoleplayState
    let state = contact.roleplayState;
    if (!state) {
      state = await this.prisma.roleplayState.upsert({
        where: { chatId },
        update: {},
        create: { chatId },
      });
    }

    // 2. Compute WIB local time details
    const hour = Number(
      new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        hour12: false,
        timeZone: 'Asia/Jakarta',
      }).format(now),
    );
    const minute = Number(
      new Intl.DateTimeFormat('en-US', {
        minute: '2-digit',
        timeZone: 'Asia/Jakarta',
      }).format(now),
    );
    const totalMinutes = hour * 60 + minute;

    // Morning greeting: 07:00 - 08:30 WIB
    const isMorningGreetingTime = totalMinutes >= 7 * 60 && totalMinutes <= 8 * 60 + 30;
    // Night greeting: 22:00 - 23:30 WIB
    const isNightGreetingTime = totalMinutes >= 22 * 60 && totalMinutes <= 23 * 60 + 30;

    // 3. Morning Greeting Check
    if (isMorningGreetingTime) {
      const alreadySent = await this.hasSentLogToday(chatId, 'morning_greeting', now);
      if (!alreadySent) {
        // Double check no recent activity to avoid collision
        if (!(await this.hasRecentInteractionOrTyping(chatId))) {
          await this.triggerProactiveGreeting(contact, state, 'morning_greeting');
          return;
        }
      }
    }

    // 4. Night Greeting Check
    if (isNightGreetingTime) {
      const alreadySent = await this.hasSentLogToday(chatId, 'night_greeting', now);
      if (!alreadySent) {
        // Double check no recent activity to avoid collision
        if (!(await this.hasRecentInteractionOrTyping(chatId))) {
          await this.triggerProactiveGreeting(contact, state, 'night_greeting');
          return;
        }
      }
    }

    // 5. Inactivity (Kerinduan) Check
    if (state.lastInteractionAt) {
      const inactivityHoursLimit = this.config.get('PROACTIVE_INACTIVITY_HOURS');
      const silenceDurationMs = now.getTime() - state.lastInteractionAt.getTime();
      const silenceHours = silenceDurationMs / (60 * 60 * 1000);

      if (silenceHours >= inactivityHoursLimit) {
        // Check if we already sent inactivity proactive message in the last 24 hours
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const hasRecentInactivity = await this.prisma.proactiveLog.findFirst({
          where: {
            chatId,
            triggerType: 'inactivity',
            sentAt: { gte: oneDayAgo },
          },
        });

        if (!hasRecentInactivity) {
          // Double check no active conversation/typing
          if (!(await this.hasRecentInteractionOrTyping(chatId))) {
            await this.triggerProactiveGreeting(contact, state, 'inactivity');
            return;
          }
        }
      }
    }
  }

  private async hasSentLogToday(chatId: string, triggerType: string, now: Date): Promise<boolean> {
    // We get start of today in WIB.
    // To make it simple and bulletproof, we check logs in the last 18 hours matching the type.
    // Since morning/night are far apart, an 18-hour window handles it beautifully.
    const threshold = new Date(now.getTime() - 18 * 60 * 60 * 1000);
    const logs = await this.prisma.proactiveLog.findMany({
      where: {
        chatId,
        triggerType,
        sentAt: { gte: threshold },
      },
    });

    for (const log of logs) {
      if (this.isSameDayWib(log.sentAt, now)) {
        return true;
      }
    }
    return false;
  }

  private isSameDayWib(date1: Date, date2: Date): boolean {
    const formatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'Asia/Jakarta',
    });
    return formatter.format(date1) === formatter.format(date2);
  }

  private async hasRecentInteractionOrTyping(chatId: string): Promise<boolean> {
    // 1. Check if user is currently typing
    if (this.waClient.isUserTyping(chatId)) {
      this.logger.debug(`User ${chatId} is currently typing. Skipping proactive message.`);
      return true;
    }

    // 2. Check for messages in database in the last 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recentDbMessages = await this.prisma.conversationMessage.findFirst({
      where: {
        chatId,
        createdAt: { gte: tenMinutesAgo },
      },
    });

    if (recentDbMessages) {
      this.logger.debug(`Active conversation message found in last 10 minutes for ${chatId}. Skipping proactive message.`);
      return true;
    }

    return false;
  }

  private async triggerProactiveGreeting(
    contact: any,
    state: any,
    triggerType: 'morning_greeting' | 'night_greeting' | 'inactivity',
  ): Promise<void> {
    const chatId = contact.chatId;
    const triggerKey = `${chatId}:${triggerType}`;

    if (this.activeTriggerKeys.has(triggerKey)) {
      this.logger.warn(`Skipping duplicate proactive trigger attempt for ${triggerKey}.`);
      return;
    }

    this.activeTriggerKeys.add(triggerKey);
    this.logger.log(`Triggering proactive greeting of type "${triggerType}" for ${chatId}`);

    try {
      // 1. Fetch relevant memories
      const compiledMemories = await this.memories.retrieve(chatId, '');

      // 2. Get character profile
      const profile = this.characterProfile.getProfile(contact.persona);

      // 3. Compile prompt
      const timeText = new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: 'Asia/Jakarta',
      }).format(new Date());

      const messages = this.promptCompiler.compile({
        profile,
        state,
        triggerType,
        timeText,
        memories: compiledMemories,
      });

      // 4. Call LLM
      const llmResult = await this.llm.generateReply({
        messages,
        providerName: contact.llmProvider,
        model: contact.llmModel,
      });

      const cleanText = this.stripOuterQuotes(llmResult.text);

      if (!cleanText) {
        this.logger.warn(`Generated proactive message was empty for ${chatId}. Skipping send.`);
        return;
      }

      // 5. Send message
      await this.waClient.sendMessage(chatId, cleanText);

      // 6. Log and update state to avoid immediate duplicate triggers
      await this.prisma.proactiveLog.create({
        data: {
          chatId,
          triggerType,
        },
      });

      await this.prisma.roleplayState.update({
        where: { chatId },
        data: {
          lastInteractionAt: new Date(),
        },
      });

      // Record message log to ConversationMessage to maintain history
      await this.prisma.conversationMessage.create({
        data: {
          chatId,
          direction: 'outbound',
          body: cleanText,
        },
      });

      this.logger.log(`Proactive greeting "${triggerType}" successfully sent to ${chatId}.`);
    } catch (error) {
      this.logger.error(`Failed to generate/send proactive greeting for ${chatId}: ${error instanceof Error ? error.stack : error}`);
    } finally {
      this.activeTriggerKeys.delete(triggerKey);
    }
  }

  private async runInitiativesCycle(): Promise<void> {
    try {
      await this.checkInitiatives();
    } finally {
      this.scheduleNextCheck();
    }
  }

  private scheduleNextCheck(): void {
    this.clearCheckTimer();

    const intervalMs = this.config.get('PROACTIVE_CHECK_INTERVAL_MINS') * 60 * 1000;
    this.checkTimer = setTimeout(() => {
      this.checkTimer = undefined;
      void this.runInitiativesCycle();
    }, intervalMs);
  }

  private clearStartupTimer(): void {
    if (!this.startupTimer) {
      return;
    }

    clearTimeout(this.startupTimer);
    this.startupTimer = undefined;
  }

  private clearCheckTimer(): void {
    if (!this.checkTimer) {
      return;
    }

    clearTimeout(this.checkTimer);
    this.checkTimer = undefined;
  }

  private stripOuterQuotes(str: string): string {
    const trimmed = str.trim();
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('“') && trimmed.endsWith('”')) ||
      (trimmed.startsWith('‘') && trimmed.endsWith('’'))
    ) {
      return trimmed.slice(1, -1).trim();
    }
    return trimmed;
  }
}
