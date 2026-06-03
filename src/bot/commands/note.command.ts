import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BotReply } from '../domain/bot-reply';
import { CommandContext } from '../domain/command-context';
import { CommandHandler } from '../domain/command-handler';

@Injectable()
export class NoteCommand implements CommandHandler {
  readonly command = 'catat';
  readonly description = 'Simpan catatan untuk chat ini.';

  constructor(private readonly prisma: PrismaService) {}

  async handle(context: CommandContext): Promise<BotReply> {
    const text = context.rawArgs.trim();

    if (!text) {
      return {
        text: 'Format: /catat isi catatan',
      };
    }

    await this.prisma.note.create({
      data: {
        chatId: context.message.chatId,
        text,
      },
    });

    return {
      text: 'Catatan disimpan.',
    };
  }
}
