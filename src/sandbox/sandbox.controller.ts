import { Controller, Delete, Get, Post, Body, Param, Res, HttpStatus } from '@nestjs/common';
import { RoleplayMood } from '@prisma/client';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { PrismaService, prismaStorage } from '../infra/prisma/prisma.service';
import { SandboxPrismaService } from '../infra/prisma/sandbox-prisma.service';
import { RoleplayChatService } from '../roleplay/roleplay-chat.service';
import { RoleplayResetService } from '../roleplay/state/roleplay-reset.service';
import { ConversationsService } from '../conversations/conversations.service';
import { LlmService } from '../llm/llm.service';
import { IncomingMessage } from '../messages/domain/incoming-message';
import { resolveBotReplyParts } from '../bot/domain/bot-reply';
import {
  parseSandboxAddMemoryInput,
  parseSandboxChatId,
  parseSandboxChatInput,
  parseSandboxMemoryId,
  parseSandboxPresenceUpdateInput,
  parseSandboxStateUpdateInput,
} from './sandbox.validation';

@Controller()
export class SandboxController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sandboxPrisma: SandboxPrismaService,
    private readonly roleplayChat: RoleplayChatService,
    private readonly roleplayReset: RoleplayResetService,
    private readonly conversations: ConversationsService,
    private readonly llm: LlmService,
  ) {}

  private getAssetPath(filename: string): string {
    const srcPath = join(process.cwd(), 'src', 'dashboard', 'public', filename);
    if (existsSync(srcPath)) {
      return srcPath;
    }
    // Fallback relative path for production build dist
    return join(__dirname, '..', 'dashboard', 'public', filename);
  }

  @Get(['/Sandbox', '/sandbox'])
  getSandboxIndex(@Res() res: any) {
    try {
      const htmlPath = this.getAssetPath('sandbox.html');
      const htmlContent = readFileSync(htmlPath, 'utf8');
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'no-store');
      res.status(HttpStatus.OK).send(htmlContent);
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(
        'Sandbox assets not found. Make sure src/dashboard/public/sandbox.html exists.'
      );
    }
  }

  @Get('/sandbox.js')
  getSandboxJs(@Res() res: any) {
    try {
      const jsPath = this.getAssetPath('sandbox.js');
      const jsContent = readFileSync(jsPath, 'utf8');
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Cache-Control', 'no-store');
      res.status(HttpStatus.OK).send(jsContent);
    } catch (error) {
      res.status(HttpStatus.NOT_FOUND).send('');
    }
  }

  @Post('/api/sandbox/chat')
  async chat(@Body() body: { chatId: string; text: string }) {
    const { chatId, text } = parseSandboxChatInput(body);

    return prismaStorage.run(this.sandboxPrisma, async () => {
      const settings = await this.ensureSandboxContact(chatId);

      // 2. Prepare mock IncomingMessage
      const incoming: IncomingMessage = {
        id: `sandbox-${Date.now()}`,
        chatId,
        chatIdAliases: [chatId],
        body: text,
        timestamp: new Date(),
        isGroup: false,
      };

      // 3. Record inbound message in sandbox database
      await this.conversations.recordInbound(incoming);

      // 4. Generate Alya's reply using live roleplay engine
      const { result: reply, usage } = await this.llm.runWithUsage(() => this.roleplayChat.generateReply(incoming, settings));

      // 5. Resolve and record outbound message parts
      const parts = resolveBotReplyParts(reply);
      const replyText = parts.map((p) => p.text).join('\n\n');
      await this.conversations.recordOutbound(chatId, replyText, incoming.id);

      return {
        reply: replyText,
        parts: parts,
        usage: usage ?? reply.usage,
      };
    });
  }

  @Get('/api/sandbox/state/:chatId')
  async getState(@Param('chatId') chatId: string) {
    const parsedChatId = parseSandboxChatId(chatId);

    return prismaStorage.run(this.sandboxPrisma, async () => {
      await this.ensureSandboxContact(parsedChatId);

      const state = await this.prisma.roleplayState.upsert({
        where: { chatId: parsedChatId },
        update: {},
        create: { chatId: parsedChatId },
      });
      const presence = await this.prisma.roleplayPresenceState.findUnique({
        where: { chatId: parsedChatId },
      });
      const memories = await this.prisma.roleplayMemory.findMany({
        where: { chatId: parsedChatId },
        orderBy: { updatedAt: 'desc' },
      });
      const messages = await this.conversations.getRecentMessages(parsedChatId, 30);

      return {
        state,
        presence,
        memories,
        messages,
      };
    });
  }

  @Post('/api/sandbox/state/:chatId')
  async updateState(@Param('chatId') chatId: string, @Body() body: unknown) {
    const parsedChatId = parseSandboxChatId(chatId);
    const data = parseSandboxStateUpdateInput(body);

    return prismaStorage.run(this.sandboxPrisma, async () => {
      await this.ensureSandboxContact(parsedChatId);

      return this.prisma.roleplayState.upsert({
        where: { chatId: parsedChatId },
        create: {
          chatId: parsedChatId,
          mood: data.mood ?? RoleplayMood.neutral,
          affection: data.affection ?? 50,
          trust: data.trust ?? 50,
          energy: data.energy ?? 70,
          tension: data.tension ?? 0,
          intimacy: data.intimacy ?? 10,
          shyness: data.shyness ?? 15,
          curiosity: data.curiosity ?? 55,
          volatility: data.volatility ?? 15,
          desire: data.desire ?? 20,
          inhibition: data.inhibition ?? 55,
          comfort: data.comfort ?? 55,
          compliance: data.compliance ?? 40,
          summary: data.summary ?? '',
        },
        update: data,
      });
    });
  }

  @Post('/api/sandbox/presence/:chatId')
  async updatePresence(@Param('chatId') chatId: string, @Body() body: unknown) {
    const parsedChatId = parseSandboxChatId(chatId);
    const data = parseSandboxPresenceUpdateInput(body);

    return prismaStorage.run(this.sandboxPrisma, async () => {
      await this.ensureSandboxContact(parsedChatId);

      const startedAt = new Date();
      const expiresAt = new Date(startedAt.getTime() + data.durationMinutes * 60 * 1000);

      return this.prisma.roleplayPresenceState.upsert({
        where: { chatId: parsedChatId },
        create: {
          chatId: parsedChatId,
          activityType: data.activityType,
          statusText: data.statusText,
          locationLabel: data.locationLabel,
          socialContext: data.socialContext,
          interruptibility: data.interruptibility,
          source: data.source,
          priority: data.priority,
          startedAt,
          expiresAt,
          lastReason: data.lastReason ?? 'manual_sandbox_override',
        },
        update: {
          activityType: data.activityType,
          statusText: data.statusText,
          locationLabel: data.locationLabel,
          socialContext: data.socialContext,
          interruptibility: data.interruptibility,
          source: data.source,
          priority: data.priority,
          startedAt,
          expiresAt,
          lastReason: data.lastReason ?? 'manual_sandbox_override',
        },
      });
    });
  }

  @Post('/api/sandbox/memory/:chatId')
  async addMemory(@Param('chatId') chatId: string, @Body() body: unknown) {
    const parsedChatId = parseSandboxChatId(chatId);
    const data = parseSandboxAddMemoryInput(body);

    return prismaStorage.run(this.sandboxPrisma, async () => {
      await this.ensureSandboxContact(parsedChatId);

      return this.prisma.roleplayMemory.create({
        data: {
          chatId: parsedChatId,
          kind: data.kind,
          content: data.content,
          importance: data.importance,
          confidence: 1.0,
          sourceText: 'Manual entry via Sandbox',
        },
      });
    });
  }

  @Delete('/api/sandbox/memory/:memoryId')
  async deleteMemory(@Param('memoryId') memoryId: string) {
    const parsedMemoryId = parseSandboxMemoryId(memoryId);

    return prismaStorage.run(this.sandboxPrisma, async () => {
      return this.prisma.roleplayMemory.delete({
        where: { id: parsedMemoryId },
      });
    });
  }

  @Post('/api/sandbox/reset/:chatId')
  async reset(@Param('chatId') chatId: string) {
    const parsedChatId = parseSandboxChatId(chatId);

    return prismaStorage.run(this.sandboxPrisma, async () => {
      return this.roleplayReset.reset(parsedChatId, 'all');
    });
  }

  private async ensureSandboxContact(chatId: string) {
    const existing = await this.prisma.contactSetting.findUnique({
      where: { chatId },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.contactSetting.create({
      data: {
        chatId,
        mode: 'auto_reply',
      },
    });
  }
}
