import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RoleplayPresenceService } from './roleplay-presence.service';

const PRESENCE_STARTUP_DELAY_MS = 20_000;
const PRESENCE_REFRESH_INTERVAL_MS = 12 * 60 * 1000;

@Injectable()
export class RoleplayPresenceSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoleplayPresenceSchedulerService.name);
  private startupTimer?: NodeJS.Timeout;
  private cycleTimer?: NodeJS.Timeout;
  private isRefreshing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: RoleplayPresenceService,
  ) {}

  onModuleInit(): void {
    this.logger.log('Initializing roleplay presence scheduler.');

    this.startupTimer = setTimeout(() => {
      this.startupTimer = undefined;
      void this.runCycle();
    }, PRESENCE_STARTUP_DELAY_MS);
  }

  onModuleDestroy(): void {
    if (this.startupTimer) {
      clearTimeout(this.startupTimer);
      this.startupTimer = undefined;
    }

    if (this.cycleTimer) {
      clearTimeout(this.cycleTimer);
      this.cycleTimer = undefined;
    }
  }

  private async runCycle(): Promise<void> {
    if (this.isRefreshing) {
      this.logger.warn('Skipping presence scheduler cycle because the previous cycle is still running.');
      this.scheduleNextCycle();
      return;
    }

    this.isRefreshing = true;

    try {
      const contacts = await this.prisma.contactSetting.findMany({
        where: {
          OR: [
            { roleplayState: { isNot: null } },
            { mode: 'auto_reply' },
          ],
        },
        include: {
          roleplayState: true,
        },
      });

      for (const contact of contacts) {
        if (contact.chatId.startsWith('sandbox-')) {
          continue;
        }

        if (!contact.roleplayState) {
          continue;
        }

        await this.presence.ensureCurrentPresence(contact.chatId, contact.roleplayState);
      }
    } catch (error) {
      this.logger.error(`Presence scheduler cycle failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    } finally {
      this.isRefreshing = false;
      this.scheduleNextCycle();
    }
  }

  private scheduleNextCycle(): void {
    if (this.cycleTimer) {
      clearTimeout(this.cycleTimer);
    }

    this.cycleTimer = setTimeout(() => {
      this.cycleTimer = undefined;
      void this.runCycle();
    }, PRESENCE_REFRESH_INTERVAL_MS);
  }
}
