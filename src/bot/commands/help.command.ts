import { Injectable } from '@nestjs/common';
import { BotReply } from '../domain/bot-reply';
import { CommandContext } from '../domain/command-context';
import { CommandHandler } from '../domain/command-handler';

@Injectable()
export class HelpCommand implements CommandHandler {
  readonly command = 'help';
  readonly description = 'Tampilkan daftar command.';

  async handle(_context: CommandContext): Promise<BotReply> {
    return {
      text: [
        'Command tersedia:',
        '/ping - Cek bot aktif.',
        '/mode - Lihat mode chat.',
        '/mode command_only - Hanya balas command.',
        '/mode auto_reply - Balas pesan biasa memakai runtime roleplay.',
        '/mode silent - Diam kecuali command.',
        '/catat isi catatan - Simpan catatan.',
        '/notes - Tampilkan 5 catatan terakhir.',
        '/persona teks - Set persona.',
        '/persona reset - Hapus persona.',
        '/ai pertanyaan - Tanya AI.',
        '/provider - Lihat/set provider AI.',
        '/model - Lihat/set model AI.',
        '/rp_reset - Reset roleplay untuk testing.',
      ].join('\n'),
    };
  }
}
