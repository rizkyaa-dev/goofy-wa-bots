import { Injectable } from '@nestjs/common';
import { ContactSetting } from '@prisma/client';
import { BotReply } from '../bot/domain/bot-reply';
import { IncomingMessage } from '../messages/domain/incoming-message';
import { RoleplayReplyUseCase } from './use-cases/roleplay-reply.use-case';

@Injectable()
export class RoleplayChatService {
  constructor(private readonly replyUseCase: RoleplayReplyUseCase) {}

  async generateReply(message: IncomingMessage, settings: ContactSetting): Promise<BotReply> {
    return this.replyUseCase.execute({ message, settings });
  }
}
