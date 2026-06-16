import { Injectable } from '@nestjs/common';
import { RoleplayMemory } from '@prisma/client';
import { BotReply, BotReplyPart } from '../../bot/domain/bot-reply';
import { LlmMessage } from '../../llm/domain/llm.types';
import { RoleplayResponsePlan } from '../domain/roleplay-response-plan';
import { ContinuityGuardService } from '../validation/continuity-guard.service';
import { ResponseValidatorService } from '../validation/response-validator.service';

type ProcessReplyInput = {
  text: string;
  delimiter: string;
  maxBubbles: number;
  allowSentenceFallbackSplit: boolean;
  interBubbleDelayMs: number;
  latestUserMessage: string;
  recentMessages: LlmMessage[];
  characterName: string;
  memories: RoleplayMemory[];
  quoteTargetText?: string;
  quoteMessageId?: string;
  responsePlan: RoleplayResponsePlan;
  conversationScope: 'personal_chat' | 'group_chat';
};

@Injectable()
export class RoleplayReplyPostProcessorService {
  constructor(
    private readonly continuityGuard: ContinuityGuardService,
    private readonly responseValidator: ResponseValidatorService,
  ) {}

  process(input: ProcessReplyInput): BotReply {
    const cleanedParts = this.parseReplyParts({
      text: input.text,
      delimiter: input.delimiter,
      maxBubbles: input.maxBubbles,
      allowSentenceFallbackSplit: input.allowSentenceFallbackSplit,
    })
      .map((part) => this.cleanReply(part, input.recentMessages))
      .filter((part) => part.trim().length > 0);

    const continuitySafeParts = cleanedParts.map((part) =>
      this.continuityGuard.apply({
        text: part,
        latestUserMessage: input.latestUserMessage,
        characterName: input.characterName,
        recentMessages: input.recentMessages,
        memories: input.memories,
        quoteTargetText: input.quoteTargetText,
      }),
    );

    const validatedParts = this.responseValidator.applyToParts({
      parts: continuitySafeParts,
      latestUserMessage: input.latestUserMessage,
      recentMessages: input.recentMessages,
      plan: input.responsePlan,
      conversationScope: input.conversationScope,
    });

    const parts = this.createReplyParts({
      texts: validatedParts.slice(0, input.maxBubbles),
      quoteMessageId: input.quoteMessageId,
      interBubbleDelayMs: input.interBubbleDelayMs,
    });

    return {
      text: parts.map((part) => part.text).join('\n'),
      quoteMessageId: parts[0]?.quoteMessageId,
      parts,
    };
  }

  private parseReplyParts(input: {
    text: string;
    delimiter: string;
    maxBubbles: number;
    allowSentenceFallbackSplit: boolean;
  }): string[] {
    const { text, delimiter, maxBubbles, allowSentenceFallbackSplit } = input;
    const normalized = text.trim().replace(/\r\n/g, '\n');

    if (maxBubbles <= 1) {
      return [normalized.replaceAll(delimiter, ' ')];
    }

    const delimiterPattern = new RegExp(`\\s*${this.escapeRegExp(delimiter)}\\s*`, 'gu');
    const rawParts = normalized.includes(delimiter)
      ? normalized.split(delimiterPattern)
      : this.createSentenceFallbackParts(normalized, maxBubbles, allowSentenceFallbackSplit);
    const parts = rawParts.map((part) => part.trim()).filter(Boolean);

    if (parts.length <= maxBubbles) {
      return parts.length > 0 ? parts : [normalized];
    }

    return [...parts.slice(0, maxBubbles - 1), parts.slice(maxBubbles - 1).join(' ')];
  }

  private createSentenceFallbackParts(text: string, maxBubbles: number, allowSplit: boolean): string[] {
    if (!allowSplit) {
      return [text];
    }

    const sentences = this.splitSentences(text);

    if (sentences.length < 2) {
      return [text];
    }

    if (sentences.length <= maxBubbles) {
      return sentences;
    }

    return [...sentences.slice(0, maxBubbles - 1), sentences.slice(maxBubbles - 1).join(' ')];
  }

  private splitSentences(text: string): string[] {
    return text.match(/[^.!?]+[.!?]?/gu)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
  }

  private createReplyParts(input: {
    texts: string[];
    quoteMessageId?: string;
    interBubbleDelayMs: number;
  }): BotReplyPart[] {
    return input.texts
      .map((text, index) => ({
        text,
        quoteMessageId: index === 0 ? input.quoteMessageId : undefined,
        delayMs: index === 0 ? 0 : input.interBubbleDelayMs,
      }))
      .filter((part) => part.text.trim().length > 0);
  }

  private escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private cleanReply(text: string, recentMessages: LlmMessage[]): string {
    const cleaned = this.stripOuterQuotes(text)
      .replace(/<<<NEXT>>>/gu, ' ')
      .replace(/^\s*(?:[-*]|\d+[.)])\s+/u, '')
      .replace(/^\s*[\w .-]{1,32}:\s*/, '')
      .replace(/\[.*?]/g, '')
      .replace(/\((?:[^()]|\([^()]*\)){1,120}\)/g, '')
      .replace(/\*([^*]{1,160})\*/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return this.limitEmoji(
      this.limitInterviewQuestion(
        this.limitRepeatedChatFiller(this.naturalizeSocialTemplate(this.naturalizeEmotionSelfReport(cleaned)), recentMessages),
        recentMessages,
      ),
      recentMessages,
    );
  }

  private naturalizeEmotionSelfReport(text: string): string {
    return text
      .replace(/\buntung\s+aku\s+lagi\s+mood\s+bagus\b/giu, 'untung aku lagi baik hati')
      .replace(/\blagi\s+mood\s+bagus\b/giu, 'lagi baik hati')
      .replace(/\bmood[-\s]*(?:ku|aku)\s+bisa\s+anjlok\b/giu, 'aku bisa bete')
      .replace(/\bmood[-\s]*(?:ku|aku)\s+(?:naik\s+turun|naik-turun)\b/giu, 'aku jadi maju mundur')
      .replace(/\bbikin\s+mood[-\s]*(?:ku|aku)\s+(?:naik\s+turun|naik-turun)\b/giu, 'bikin aku maju mundur')
      .replace(/\brusuh\s+mood\s+pagiku\b/giu, 'rusuh pagi-pagiku')
      .replace(/\bkalau\s+dikatain\s+jelek,\s*enaknya\s+marah\s+apa\s+ketawa\s+ya\s+sekarang\?/giu, 'jahat amat. aku ketawa dikit aja deh')
      .replace(/\bmood[-\s]*(?:ku|aku)\b/giu, 'aku')
      .replace(/\bemosi(?:ku| aku)?\b/giu, 'aku')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private naturalizeSocialTemplate(text: string): string {
    return text
      .replace(/\bsenang\s+kenal\s+(?:sama|dengan)\s+kamu[,.!\s]*/giu, '')
      .replace(/\bsalam\s+kenal[,.!\s]*/giu, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/\s+([,.!?])/gu, '$1')
      .replace(/^[,.\s]+/gu, '')
      .trim();
  }

  private limitEmoji(text: string, recentMessages: LlmMessage[]): string {
    if (this.recentAssistantUsedEmoji(recentMessages)) {
      return text.replace(/\p{Extended_Pictographic}/gu, '').replace(/\s{2,}/g, ' ').trim();
    }

    let emojiSeen = false;

    return text
      .replace(/\p{Extended_Pictographic}/gu, (emoji) => {
        if (emojiSeen) {
          return '';
        }

        emojiSeen = true;
        return emoji;
      })
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private limitRepeatedChatFiller(text: string, recentMessages: LlmMessage[]): string {
    const recentAssistantText = recentMessages
      .filter((message) => message.role === 'assistant')
      .slice(-2)
      .map((message) => message.content.toLowerCase())
      .join('\n');

    const repeatedFillers = ['hehe', 'wkwk', 'haha', 'hmm', 'hm'].filter((filler) =>
      new RegExp(`\\b${filler}\\b`, 'u').test(recentAssistantText),
    );

    if (repeatedFillers.length === 0) {
      return text;
    }

    return repeatedFillers
      .reduce((current, filler) => current.replace(new RegExp(`\\b${filler}\\b[,.!?\\s]*`, 'giu'), ''), text)
      .replace(/\s+([,.!?])/gu, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private limitInterviewQuestion(text: string, recentMessages: LlmMessage[]): string {
    if (!this.recentAssistantAskedQuestion(recentMessages)) {
      return text;
    }

    const sentences = text.match(/[^.!?]+[.!?]?/gu)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [text];

    if (sentences.length < 2 || !sentences.at(-1)?.endsWith('?')) {
      return text;
    }

    return sentences
      .slice(0, -1)
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private recentAssistantUsedEmoji(recentMessages: LlmMessage[]): boolean {
    return recentMessages
      .filter((message) => message.role === 'assistant')
      .slice(-2)
      .some((message) => /\p{Extended_Pictographic}/u.test(message.content));
  }

  private recentAssistantAskedQuestion(recentMessages: LlmMessage[]): boolean {
    return recentMessages
      .filter((message) => message.role === 'assistant')
      .slice(-2)
      .some((message) => message.content.trim().endsWith('?'));
  }

  private stripOuterQuotes(str: string): string {
    const trimmed = str.trim();
    if (
      (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('â€œ') && trimmed.endsWith('â€')) ||
      (trimmed.startsWith('â€˜') && trimmed.endsWith('â€™'))
    ) {
      return trimmed.slice(1, -1).trim();
    }
    return trimmed;
  }
}
