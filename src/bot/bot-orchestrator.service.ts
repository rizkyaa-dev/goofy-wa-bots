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

    const reply = await this.roleplayChat.generateReply(message, settings);
    await this.recordReply(message, reply);
    return reply;
  }

  async handleBatch(messages: IncomingMessage[]): Promise<BotReply | null> {
    const freshMessages = messages.filter((message) => !this.deduplicator.isDuplicate(message.id));

    if (freshMessages.length === 0) {
      return null;
    }

    if (freshMessages.length === 1) {
      return this.handleFreshNonCommand(freshMessages[0]);
    }

    const latestMessage = freshMessages.at(-1) as IncomingMessage;
    const batchedMessage = this.createBatchedMessage(freshMessages);

    if (!this.contactPolicy.canRespondTo(batchedMessage)) {
      this.logger.debug(`Ignored batched messages from non-allowlisted chat ${latestMessage.chatId}`);
      return null;
    }

    for (const message of freshMessages) {
      await this.conversations.recordInbound(message);
    }

    const settings = await this.contactSettings.getOrCreate(latestMessage.chatId);

    if (settings.mode === BotMode.silent || settings.mode === BotMode.command_only) {
      return null;
    }

    const reply = await this.roleplayChat.generateReply(batchedMessage, settings);
    await this.recordReply(latestMessage, reply);
    return reply;
  }

  private async handleFreshNonCommand(message: IncomingMessage): Promise<BotReply | null> {
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

    if (settings.mode === BotMode.silent || settings.mode === BotMode.command_only) {
      return null;
    }

    const reply = await this.roleplayChat.generateReply(message, settings);
    await this.recordReply(message, reply);
    return reply;
  }

  private createBatchedMessage(messages: IncomingMessage[]): IncomingMessage {
    const latestMessage = messages.at(-1) as IncomingMessage;
    const aliases = new Set(messages.flatMap((message) => message.chatIdAliases));

    return {
      ...latestMessage,
      id: `batch:${messages.map((message) => message.id).join('|')}`,
      chatIdAliases: Array.from(aliases),
      body: messages.map((message) => message.body).join('\n'),
    };
  }

  private async recordReply(message: IncomingMessage, reply: BotReply | null): Promise<void> {
    if (!reply) {
      return;
    }

    await this.conversations.recordOutbound(message.chatId, reply.text, message.id);
  }
}
