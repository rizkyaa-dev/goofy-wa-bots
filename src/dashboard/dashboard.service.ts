import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BotMode } from '@prisma/client';
import { WhatsappWebClientService } from '../wa/whatsapp-web-client.service';
import { AppEnv } from '../config/env.validation';
import { AddContactMemoryInput, UpdateContactRoleplayStateInput } from './dashboard.validation';
import { DashboardRepository } from './dashboard.repository';
import { RoleplayPresenceService } from '../roleplay/presence/roleplay-presence.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly repository: DashboardRepository,
    private readonly waClient: WhatsappWebClientService,
    private readonly config: ConfigService<AppEnv, true>,
    @Optional() private readonly presence?: RoleplayPresenceService,
  ) {}

  async getStatus() {
    const connectionStatus = this.waClient.getConnectionStatus();
    const lastQr = this.waClient.getLastQrCode();

    const activeContactsCount = await this.repository.countContacts();
    const autoReplyContactsCount = await this.repository.countAutoReplyContacts();

    return {
      whatsapp: {
        status: connectionStatus,
        hasQr: !!lastQr,
        qrCode: lastQr,
      },
      bot: {
        characterName: this.config.get('ROLEPLAY_CHARACTER_NAME'),
        defaultMode: this.config.get('BOT_DEFAULT_MODE'),
        llmProvider: this.config.get('LLM_PROVIDER'),
      },
      stats: {
        totalContacts: activeContactsCount,
        autoReplyContacts: autoReplyContactsCount,
      },
    };
  }

  async getContacts() {
    const contacts = await this.repository.findContacts();
    const legacyContacts = contacts.filter((contact) =>
      contact.roleplayState && contact.roleplayPresenceState && this.presence?.isLegacyScheduledStatus(contact.roleplayPresenceState),
    );

    if (this.presence && legacyContacts.length > 0) {
      for (const contact of legacyContacts) {
        await this.presence.ensureCurrentPresence(contact.chatId, contact.roleplayState!);
      }

      return this.repository.findContacts();
    }

    return contacts;
  }

  async getContactMemory(chatId: string) {
    return this.repository.findMemories(chatId);
  }

  async addContactMemory(chatId: string, data: AddContactMemoryInput) {
    this.logger.log(`Manually adding memory for contact ${chatId}: [${data.kind}] ${data.content}`);
    await this.ensureContactSetting(chatId);

    return this.repository.createMemory(chatId, data);
  }

  async deleteMemory(memoryId: string) {
    this.logger.log(`Deleting memory with ID: ${memoryId}`);
    try {
      return await this.repository.deleteMemory(memoryId);
    } catch (error) {
      if (this.repository.isKnownNotFoundError(error)) {
        throw new NotFoundException(`Memory ${memoryId} not found.`);
      }

      throw error;
    }
  }

  async updateContactMode(chatId: string, mode: BotMode) {
    this.logger.log(`Updating bot mode for ${chatId} to ${mode}`);
    return this.repository.upsertContactMode(chatId, mode);
  }

  async updateContactRoleplayState(chatId: string, data: UpdateContactRoleplayStateInput) {
    this.logger.log(`Updating roleplay state for ${chatId}`);
    await this.ensureContactSetting(chatId);

    return this.repository.upsertRoleplayState(chatId, data);
  }

  async restartWhatsappClient() {
    // Jalankan secara asinkron agar tidak memblokir response HTTP
    void this.waClient.restartClient().catch((error) => {
      this.logger.error(`Failed to restart WhatsApp Client: ${error.message}`, error.stack);
    });
    return { success: true, message: 'Restart triggered successfully.' };
  }

  private async ensureContactSetting(chatId: string) {
    return this.repository.ensureContactSetting(chatId, this.config.get('BOT_DEFAULT_MODE'));
  }
}
