import { Controller, Get, Post, Body, Param, Res, HttpStatus } from '@nestjs/common';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { PrismaService, prismaStorage } from '../infra/prisma/prisma.service';
import { SandboxPrismaService } from '../infra/prisma/sandbox-prisma.service';
import { RoleplayChatService } from '../roleplay/roleplay-chat.service';
import { RoleplayResetService } from '../roleplay/state/roleplay-reset.service';
import { ConversationsService } from '../conversations/conversations.service';
import { IncomingMessage } from '../messages/domain/incoming-message';
import { resolveBotReplyParts } from '../bot/domain/bot-reply';

@Controller()
export class SandboxController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sandboxPrisma: SandboxPrismaService,
    private readonly roleplayChat: RoleplayChatService,
    private readonly roleplayReset: RoleplayResetService,
    private readonly conversations: ConversationsService,
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
      res.status(HttpStatus.OK).send(jsContent);
    } catch (error) {
      res.status(HttpStatus.NOT_FOUND).send('');
    }
  }

  @Post('/api/sandbox/chat')
  async chat(@Body() body: { chatId: string; text: string }) {
    const { chatId, text } = body;

    return prismaStorage.run(this.sandboxPrisma, async () => {
      // 1. Fetch or create contact setting in sandbox db
      let settings = await this.prisma.contactSetting.findUnique({
        where: { chatId },
      });
      if (!settings) {
        settings = await this.prisma.contactSetting.create({
          data: {
            chatId,
            mode: 'auto_reply',
          },
        });
      }

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
      const reply = await this.roleplayChat.generateReply(incoming, settings);

      // 5. Resolve and record outbound message parts
      const parts = resolveBotReplyParts(reply);
      const replyText = parts.map((p) => p.text).join('\n\n');
      await this.conversations.recordOutbound(chatId, replyText, incoming.id);

      return {
        reply: replyText,
        parts: parts,
      };
    });
  }

  @Get('/api/sandbox/state/:chatId')
  async getState(@Param('chatId') chatId: string) {
    return prismaStorage.run(this.sandboxPrisma, async () => {
      const state = await this.prisma.roleplayState.findUnique({
        where: { chatId },
      });
      const memories = await this.prisma.roleplayMemory.findMany({
        where: { chatId },
        orderBy: { updatedAt: 'desc' },
      });
      const messages = await this.conversations.getRecentMessages(chatId, 30);

      return {
        state: state || {
          mood: 'neutral',
          affection: 50,
          trust: 50,
          energy: 70,
          tension: 0,
          intimacy: 10,
          shyness: 15,
          curiosity: 55,
          summary: '',
        },
        memories,
        messages,
      };
    });
  }

  @Post('/api/sandbox/reset/:chatId')
  async reset(@Param('chatId') chatId: string) {
    return prismaStorage.run(this.sandboxPrisma, async () => {
      return this.roleplayReset.reset(chatId, 'all');
    });
  }
}
