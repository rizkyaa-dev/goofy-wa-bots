import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../infra/prisma/prisma.service';
import { WhatsappWebClientService, WhatsappConnectionStatus } from '../wa/whatsapp-web-client.service';
import { AppEnv } from '../config/env.validation';
import { BotMode, RoleplayMood, RoleplayMemoryKind } from '@prisma/client';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly waClient: WhatsappWebClientService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async getStatus() {
    const connectionStatus = this.waClient.getConnectionStatus();
    const lastQr = this.waClient.getLastQrCode();

    const activeContactsCount = await this.prisma.contactSetting.count();
    const autoReplyContactsCount = await this.prisma.contactSetting.count({
      where: { mode: BotMode.auto_reply },
    });

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
    return this.prisma.contactSetting.findMany({
      include: {
        roleplayState: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });
  }

  async getContactMemory(chatId: string) {
    return this.prisma.roleplayMemory.findMany({
      where: { chatId },
      orderBy: [
        { kind: 'asc' },
        { importance: 'desc' },
      ],
    });
  }

  async addContactMemory(chatId: string, data: { kind: RoleplayMemoryKind; content: string; importance: number }) {
    this.logger.log(`Manually adding memory for contact ${chatId}: [${data.kind}] ${data.content}`);
    return this.prisma.roleplayMemory.create({
      data: {
        chatId,
        kind: data.kind,
        content: data.content,
        importance: data.importance,
        confidence: 1.0,
        sourceText: 'Manual entry via Dashboard',
      },
    });
  }

  async deleteMemory(memoryId: string) {
    this.logger.log(`Deleting memory with ID: ${memoryId}`);
    return this.prisma.roleplayMemory.delete({
      where: { id: memoryId },
    });
  }

  async updateContactMode(chatId: string, mode: BotMode) {
    this.logger.log(`Updating bot mode for ${chatId} to ${mode}`);
    return this.prisma.contactSetting.update({
      where: { chatId },
      data: { mode },
    });
  }

  async updateContactRoleplayState(
    chatId: string,
    data: { mood?: RoleplayMood; affection?: number; trust?: number; energy?: number; tension?: number; intimacy?: number; shyness?: number; summary?: string },
  ) {
    this.logger.log(`Updating roleplay state for ${chatId}`);
    return this.prisma.roleplayState.upsert({
      where: { chatId },
      create: {
        chatId,
        mood: data.mood ?? RoleplayMood.neutral,
        affection: data.affection ?? 50,
        trust: data.trust ?? 50,
        energy: data.energy ?? 70,
        tension: data.tension ?? 0,
        intimacy: data.intimacy ?? 10,
        shyness: data.shyness ?? 15,
        summary: data.summary ?? '',
      },
      update: data,
    });
  }

  async restartWhatsappClient() {
    // Jalankan secara asinkron agar tidak memblokir response HTTP
    void this.waClient.restartClient().catch((error) => {
      this.logger.error(`Failed to restart WhatsApp Client: ${error.message}`, error.stack);
    });
    return { success: true, message: 'Restart triggered successfully.' };
  }
}
