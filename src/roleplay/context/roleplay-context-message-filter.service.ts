import { Injectable } from '@nestjs/common';
import { ConversationMessage, MessageDirection } from '@prisma/client';

@Injectable()
export class RoleplayContextMessageFilterService {
  filter(messages: ConversationMessage[]): ConversationMessage[] {
    const commandMessageIds = new Set(
      messages
        .filter((message) => message.messageId && this.isInboundCommand(message))
        .map((message) => message.messageId as string),
    );

    return messages.filter((message) => !this.isCommandNoise(message, commandMessageIds));
  }

  private isCommandNoise(message: ConversationMessage, commandMessageIds: ReadonlySet<string>): boolean {
    if (this.isInboundCommand(message)) {
      return true;
    }

    if (message.direction !== MessageDirection.outbound) {
      return false;
    }

    if (message.messageId?.startsWith('reply:') && commandMessageIds.has(message.messageId.slice('reply:'.length))) {
      return true;
    }

    return this.looksLikeCommandResponse(message.body);
  }

  private isInboundCommand(message: ConversationMessage): boolean {
    return message.direction === MessageDirection.inbound && /^[!/]/u.test(message.body.trim());
  }

  private looksLikeCommandResponse(body: string): boolean {
    const text = body.trim();

    return (
      [
        'AI error',
        'Belum ada catatan.',
        'Catatan disimpan.',
        'Catatan terakhir:',
        'Command tersedia:',
        'Command /',
        'Format: /',
        'Memory roleplay',
        'Mode diubah',
        'Mode sekarang:',
        'Mode tidak valid.',
        'Model chat',
        'Persona dihapus.',
        'Persona diset:',
        'Persona sekarang:',
        'Pilihan:',
        'Provider chat',
        'Provider chat direset',
        'Provider chat diset',
        'Provider tidak didukung.',
        'Roleplay reset',
        'Scope tidak valid.',
      ].some((prefix) => text.startsWith(prefix)) || /^\d+\.\s+\[(?:user_fact|relationship|episode|preference|boundary|goal)\]/u.test(text)
    );
  }
}
