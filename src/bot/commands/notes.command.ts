import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { BotReply } from '../domain/bot-reply';
import { CommandContext } from '../domain/command-context';
import { CommandHandler } from '../domain/command-handler';

@Injectable()
export class NotesCommand implements CommandHandler {
  readonly command = 'notes';
  readonly description = 'Tampilkan 5 catatan terakhir.';

  constructor(private readonly prisma: PrismaService) {}

  async handle(context: CommandContext): Promise<BotReply> {
    const notes = await this.prisma.note.findMany({
      where: { chatId: context.message.chatId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (notes.length === 0) {
      return {
        text: 'Belum ada catatan.',
      };
    }

    const text = notes
      .map((note, index) => `${index + 1}. ${note.text}`)
      .join('\n');

    return {
      text: `Catatan terakhir:\n${text}`,
    };
  }
}
