import { Injectable } from '@nestjs/common';
import { Contact, Message } from 'whatsapp-web.js';
import { IncomingMessage } from '../messages/domain/incoming-message';

@Injectable()
export class WhatsappMessageNormalizerService {
  async normalize(message: Message): Promise<IncomingMessage> {
    const contact = await this.getContact(message);

    return {
      id: message.id._serialized,
      chatId: message.from,
      chatIdAliases: this.createChatIdAliases(message, contact),
      authorId: message.author,
      body: message.body.trim(),
      timestamp: new Date(message.timestamp * 1000),
      isGroup: message.from.endsWith('@g.us'),
    };
  }

  private async getContact(message: Message): Promise<Contact | null> {
    try {
      return await message.getContact();
    } catch {
      return null;
    }
  }

  private createChatIdAliases(message: Message, contact: Contact | null): string[] {
    const aliases = new Set<string>();

    aliases.add(message.from);

    if (message.author) {
      aliases.add(message.author);
    }

    if (contact?.id?._serialized) {
      aliases.add(contact.id._serialized);
    }

    if (contact?.number) {
      aliases.add(`${contact.number}@c.us`);
    }

    return Array.from(aliases);
  }
}
