import { Injectable, Optional } from '@nestjs/common';
import { resolveBotReplyParts } from '../bot/domain/bot-reply';
import { ConversationsService } from '../conversations/conversations.service';
import { SandboxPrismaService } from '../infra/prisma/sandbox-prisma.service';
import { prismaStorage } from '../infra/prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import { IncomingMessage } from '../messages/domain/incoming-message';
import { RoleplayChatService } from '../roleplay/roleplay-chat.service';
import { RoleplayResetService } from '../roleplay/state/roleplay-reset.service';
import { RoleplayPresenceService } from '../roleplay/presence/roleplay-presence.service';
import { SandboxRepository } from './sandbox.repository';
import {
  SandboxAddMemoryInput,
  SandboxChatInput,
  SandboxPresenceUpdateInput,
  SandboxStateUpdateInput,
} from './sandbox.validation';

@Injectable()
export class SandboxUseCase {
  constructor(
    private readonly sandboxPrisma: SandboxPrismaService,
    private readonly repository: SandboxRepository,
    private readonly roleplayChat: RoleplayChatService,
    private readonly roleplayReset: RoleplayResetService,
    private readonly conversations: ConversationsService,
    private readonly llm: LlmService,
    @Optional() private readonly presence?: RoleplayPresenceService,
  ) {}

  chat(input: SandboxChatInput) {
    return this.runInSandbox(async () => {
      const settings = await this.repository.ensureContact(input.chatId);
      const incoming: IncomingMessage = {
        id: `sandbox-${Date.now()}`,
        chatId: input.chatId,
        chatIdAliases: [input.chatId],
        body: input.text,
        timestamp: new Date(),
        isGroup: false,
      };

      await this.conversations.recordInbound(incoming);

      const { result: reply, usage } = await this.llm.runWithUsage(() => this.roleplayChat.generateReply(incoming, settings));
      const parts = resolveBotReplyParts(reply);
      const replyText = parts.map((part) => part.text).join('\n\n');
      await this.conversations.recordOutbound(input.chatId, replyText, incoming.id);
      const tokenUsage = await this.repository.accumulateTokenUsage(input.chatId, usage ?? reply.usage);

      return {
        reply: replyText,
        parts,
        usage: usage ?? reply.usage,
        tokenUsage,
      };
    });
  }

  getState(chatId: string) {
    return this.runInSandbox(async () => {
      await this.repository.ensureContact(chatId);
      const bundle = await this.repository.getStateBundle(chatId, 30);

      if (bundle.presence && this.presence?.isLegacyScheduledStatus(bundle.presence)) {
        await this.presence.ensureCurrentPresence(chatId, bundle.state);
        return this.repository.getStateBundle(chatId, 30);
      }

      return bundle;
    });
  }

  updateState(chatId: string, data: SandboxStateUpdateInput) {
    return this.runInSandbox(async () => {
      await this.repository.ensureContact(chatId);
      return this.repository.upsertState(chatId, data);
    });
  }

  updatePresence(chatId: string, data: SandboxPresenceUpdateInput) {
    return this.runInSandbox(async () => {
      await this.repository.ensureContact(chatId);
      const startedAt = new Date();
      const expiresAt = new Date(startedAt.getTime() + data.durationMinutes * 60 * 1000);
      return this.repository.upsertPresence(chatId, data, startedAt, expiresAt);
    });
  }

  addMemory(chatId: string, data: SandboxAddMemoryInput) {
    return this.runInSandbox(async () => {
      await this.repository.ensureContact(chatId);
      return this.repository.createMemory(chatId, data);
    });
  }

  deleteMemory(memoryId: string) {
    return this.runInSandbox(() => this.repository.deleteMemory(memoryId));
  }

  async reset(chatId: string) {
    return this.runInSandbox(async () => {
      const result = await this.roleplayReset.reset(chatId, 'all');
      await this.repository.resetTokenUsage(chatId);
      return result;
    });
  }

  runInSandbox<T>(operation: () => Promise<T>): Promise<T> {
    return prismaStorage.run(this.sandboxPrisma, operation);
  }
}
