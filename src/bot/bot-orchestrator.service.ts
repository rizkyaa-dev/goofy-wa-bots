import { Injectable, Logger } from '@nestjs/common';
import { BotMode } from '@prisma/client';
import { ContactPolicyService } from '../contacts/contact-policy.service';
import { ContactSettingsRepository } from '../contacts/contact-settings.repository';
import { ConversationsService } from '../conversations/conversations.service';
import { IncomingMessage } from '../messages/domain/incoming-message';
import { MessageDeduplicatorService } from '../messages/message-deduplicator.service';
import { RoleplayChatService } from '../roleplay/roleplay-chat.service';
import { BotReply } from './domain/bot-reply';
import { CommandRegistryService } from './command-registry.service';
import { TemporaryGreetingReplyService } from './temporary-greeting-reply.service';

@Injectable()
export class BotOrchestratorService {
  private readonly logger = new Logger(BotOrchestratorService.name);

  constructor(
    private readonly contactPolicy: ContactPolicyService,
    private readonly contactSettings: ContactSettingsRepository,
    private readonly conversations: ConversationsService,
    private readonly deduplicator: MessageDeduplicatorService,
    private readonly commandRegistry: CommandRegistryService,
    private readonly temporaryGreetingReply: TemporaryGreetingReplyService,
    private readonly roleplayChat: RoleplayChatService,
  ) {}

  async handle(message: IncomingMessage): Promise<BotReply | null> {
    if (this.deduplicator.isDuplicate(message.id)) {
      return null;
    }

    const temporaryReply = this.temporaryGreetingReply.createReply(message);
    if (temporaryReply) {
      await this.conversations.recordInbound(message);
      await this.recordReply(message, temporaryReply);
      return temporaryReply;
    }

    if (!this.contactPolicy.canRespondTo(message)) {
      this.logger.debug(`Ignored message from non-allowlisted chat ${message.chatId}`);
      return null;
    }

    await this.conversations.recordInbound(message);

    const settings = await this.contactSettings.getOrCreate(message.chatId);
    const isCommand = this.commandRegistry.isCommand(message.body);

    if (isCommand) {
      const reply = await this.commandRegistry.execute({
        message,
        settings,
        args: [],
        rawArgs: '',
      });
      await this.recordReply(message, reply);
      return reply;
    }

    if (settings.mode === BotMode.silent || settings.mode === BotMode.command_only) {
      return null;
    }

    const reply = {
      text: await this.roleplayChat.generateReply(message, settings),
    };
    await this.recordReply(message, reply);
    return reply;
  }

  private async recordReply(message: IncomingMessage, reply: BotReply | null): Promise<void> {
    if (!reply) {
      return;
    }

    await this.conversations.recordOutbound(message.chatId, reply.text, message.id);
  }
}
