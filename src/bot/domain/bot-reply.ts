import { LlmTokenUsage } from '../../llm/domain/llm.types';

export type BotReply = {
  text: string;
  quoteMessageId?: string;
  parts?: BotReplyPart[];
  usage?: LlmTokenUsage;
};

export type BotReplyPart = {
  text: string;
  quoteMessageId?: string;
  delayMs?: number;
};

export function resolveBotReplyParts(reply: BotReply): BotReplyPart[] {
  const parts = reply.parts?.filter((part) => part.text.trim().length > 0) ?? [];

  if (parts.length > 0) {
    return parts;
  }

  return [
    {
      text: reply.text,
      quoteMessageId: reply.quoteMessageId,
    },
  ];
}
