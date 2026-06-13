export type BotReply = {
  text: string;
  quoteMessageId?: string;
  parts?: BotReplyPart[];
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
