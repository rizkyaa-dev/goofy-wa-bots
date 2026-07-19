import { Controller, Delete, Get, Post, Body, Param, Res, HttpStatus, UseGuards } from '@nestjs/common';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { DashboardAuthGuard } from '../dashboard-security/dashboard-auth.guard';
import { SandboxUseCase } from './sandbox.use-case';
import {
  parseSandboxAddMemoryInput,
  parseSandboxChatId,
  parseSandboxChatInput,
  parseSandboxMemoryId,
  parseSandboxPresenceUpdateInput,
  parseSandboxStateUpdateInput,
} from './sandbox.validation';

@Controller()
@UseGuards(DashboardAuthGuard)
export class SandboxController {
  constructor(private readonly sandbox: SandboxUseCase) {}

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
    return this.sandbox.chat(parseSandboxChatInput(body));
  }

  @Get('/api/sandbox/state/:chatId')
  async getState(@Param('chatId') chatId: string) {
    const parsedChatId = parseSandboxChatId(chatId);

    return this.sandbox.getState(parsedChatId);
  }

  @Post('/api/sandbox/state/:chatId')
  async updateState(@Param('chatId') chatId: string, @Body() body: unknown) {
    const parsedChatId = parseSandboxChatId(chatId);
    const data = parseSandboxStateUpdateInput(body);

    return this.sandbox.updateState(parsedChatId, data);
  }

  @Post('/api/sandbox/presence/:chatId')
  async updatePresence(@Param('chatId') chatId: string, @Body() body: unknown) {
    const parsedChatId = parseSandboxChatId(chatId);
    const data = parseSandboxPresenceUpdateInput(body);

    return this.sandbox.updatePresence(parsedChatId, data);
  }

  @Post('/api/sandbox/memory/:chatId')
  async addMemory(@Param('chatId') chatId: string, @Body() body: unknown) {
    const parsedChatId = parseSandboxChatId(chatId);
    const data = parseSandboxAddMemoryInput(body);

    return this.sandbox.addMemory(parsedChatId, data);
  }

  @Delete('/api/sandbox/memory/:memoryId')
  async deleteMemory(@Param('memoryId') memoryId: string) {
    const parsedMemoryId = parseSandboxMemoryId(memoryId);

    return this.sandbox.deleteMemory(parsedMemoryId);
  }

  @Post('/api/sandbox/reset/:chatId')
  async reset(@Param('chatId') chatId: string) {
    const parsedChatId = parseSandboxChatId(chatId);

    return this.sandbox.reset(parsedChatId);
  }
}
