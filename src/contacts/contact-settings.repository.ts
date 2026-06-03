import { Injectable } from '@nestjs/common';
import { BotMode, ContactSetting } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { AppEnv } from '../config/env.validation';
import { PrismaService } from '../infra/prisma/prisma.service';

@Injectable()
export class ContactSettingsRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  async getOrCreate(chatId: string): Promise<ContactSetting> {
    return this.prisma.contactSetting.upsert({
      where: { chatId },
      update: {},
      create: {
        chatId,
        mode: this.config.get('BOT_DEFAULT_MODE') as BotMode,
      },
    });
  }

  async setMode(chatId: string, mode: BotMode): Promise<ContactSetting> {
    return this.prisma.contactSetting.upsert({
      where: { chatId },
      update: { mode },
      create: { chatId, mode },
    });
  }

  async setPersona(chatId: string, persona: string | null): Promise<ContactSetting> {
    return this.prisma.contactSetting.upsert({
      where: { chatId },
      update: { persona },
      create: {
        chatId,
        persona,
        mode: this.config.get('BOT_DEFAULT_MODE') as BotMode,
      },
    });
  }

  async setLlmProvider(chatId: string, llmProvider: string | null): Promise<ContactSetting> {
    return this.prisma.contactSetting.upsert({
      where: { chatId },
      update: { llmProvider },
      create: {
        chatId,
        llmProvider,
        mode: this.config.get('BOT_DEFAULT_MODE') as BotMode,
      },
    });
  }

  async setLlmModel(chatId: string, llmModel: string | null): Promise<ContactSetting> {
    return this.prisma.contactSetting.upsert({
      where: { chatId },
      update: { llmModel },
      create: {
        chatId,
        llmModel,
        mode: this.config.get('BOT_DEFAULT_MODE') as BotMode,
      },
    });
  }
}
