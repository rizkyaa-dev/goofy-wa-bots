import { Controller, Get, Res, Param, Delete, Post, Body, HttpStatus } from '@nestjs/common';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { DashboardService } from './dashboard.service';
import { BotMode, RoleplayMood, RoleplayMemoryKind } from '@prisma/client';

@Controller()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  private getAssetPath(filename: string): string {
    // Coba temukan di folder src (lokal development)
    const srcPath = join(process.cwd(), 'src', 'dashboard', 'public', filename);
    if (existsSync(srcPath)) {
      return srcPath;
    }
    // Fallback ke folder dist (saat dibuild)
    return join(__dirname, 'public', filename);
  }

  @Get('/')
  redirectToDashboard(@Res() res: any) {
    res.redirect('/Dashboard');
  }

  @Get(['/Dashboard', '/dashboard'])
  getDashboardIndex(@Res() res: any) {
    try {
      const htmlPath = this.getAssetPath('index.html');
      const htmlContent = readFileSync(htmlPath, 'utf8');
      res.setHeader('Content-Type', 'text/html');
      res.status(HttpStatus.OK).send(htmlContent);
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send('Dashboard assets not found. Make sure src/dashboard/public/index.html exists.');
    }
  }

  @Get('/style.css')
  getStyle(@Res() res: any) {
    try {
      const cssPath = this.getAssetPath('style.css');
      const cssContent = readFileSync(cssPath, 'utf8');
      res.setHeader('Content-Type', 'text/css');
      res.status(HttpStatus.OK).send(cssContent);
    } catch (error) {
      res.status(HttpStatus.NOT_FOUND).send('');
    }
  }

  @Get('/app.js')
  getAppJs(@Res() res: any) {
    try {
      const jsPath = this.getAssetPath('app.js');
      const jsContent = readFileSync(jsPath, 'utf8');
      res.setHeader('Content-Type', 'application/javascript');
      res.status(HttpStatus.OK).send(jsContent);
    } catch (error) {
      res.status(HttpStatus.NOT_FOUND).send('');
    }
  }

  // API Endpoints
  @Get('/api/dashboard/status')
  async getStatus() {
    return this.dashboardService.getStatus();
  }

  @Get('/api/dashboard/contacts')
  async getContacts() {
    return this.dashboardService.getContacts();
  }

  @Get('/api/dashboard/contacts/:chatId/memory')
  async getContactMemory(@Param('chatId') chatId: string) {
    return this.dashboardService.getContactMemory(chatId);
  }

  @Post('/api/dashboard/contacts/:chatId/memory')
  async addContactMemory(
    @Param('chatId') chatId: string,
    @Body() body: { kind: RoleplayMemoryKind; content: string; importance: number },
  ) {
    return this.dashboardService.addContactMemory(chatId, body);
  }

  @Delete('/api/dashboard/memory/:id')
  async deleteMemory(@Param('id') id: string) {
    return this.dashboardService.deleteMemory(id);
  }

  @Post('/api/dashboard/contacts/:chatId/mode')
  async updateContactMode(@Param('chatId') chatId: string, @Body() body: { mode: BotMode }) {
    return this.dashboardService.updateContactMode(chatId, body.mode);
  }

  @Post('/api/dashboard/contacts/:chatId/state')
  async updateContactRoleplayState(
    @Param('chatId') chatId: string,
    @Body() body: { mood?: RoleplayMood; affection?: number; trust?: number; energy?: number; tension?: number; intimacy?: number; shyness?: number; summary?: string },
  ) {
    return this.dashboardService.updateContactRoleplayState(chatId, body);
  }

  @Post('/api/dashboard/wa/restart')
  async restartWhatsappClient() {
    return this.dashboardService.restartWhatsappClient();
  }
}
