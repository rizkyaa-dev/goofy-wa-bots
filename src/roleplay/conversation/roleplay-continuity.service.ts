import { Injectable } from '@nestjs/common';
import { LlmMessage } from '../../llm/domain/llm.types';
import { RoleplayContinuityContext } from '../domain/roleplay-continuity';

@Injectable()
export class RoleplayContinuityService {
  build(recentMessages: LlmMessage[], latestUserMessage: string): RoleplayContinuityContext {
    const latestActivityInMessage = this.extractCurrentActivity(latestUserMessage);
    const recentDisclosures = recentMessages
      .flatMap((message) => {
        if (message.role !== 'user') {
          return [];
        }

        const activity = this.extractCurrentActivity(message.content);
        return activity ? [{ topic: 'user_current_activity' as const, value: activity }] : [];
      })
      .slice(-3);
    const disclosures = latestActivityInMessage && recentDisclosures.at(-1)?.value !== latestActivityInMessage
      ? [...recentDisclosures, { topic: 'user_current_activity' as const, value: latestActivityInMessage }].slice(-3)
      : recentDisclosures;

    const hasActivityQuestion = this.isCharacterActivityQuestion(latestUserMessage);
    const hasAnsweredActivity = disclosures.some((disclosure) => disclosure.topic === 'user_current_activity');
    const hasFreshActivityDisclosure = Boolean(latestActivityInMessage);

    if (hasFreshActivityDisclosure) {
      return {
        disclosures,
        answeredTopics: ['user_current_activity'],
        blockedFollowUpTopics: ['user_current_activity'],
        callbackHints: [`User baru menyebut sedang ${latestActivityInMessage}; tanggapi dulu dan jangan menanyakan ulang detail aktivitas yang sama.`],
      };
    }

    if (!hasActivityQuestion || !hasAnsweredActivity) {
      return {
        disclosures,
        answeredTopics: disclosures.map((disclosure) => disclosure.topic),
        blockedFollowUpTopics: [],
        callbackHints: [],
      };
    }

    const latestActivity = disclosures.at(-1)?.value;

    return {
      disclosures,
      answeredTopics: ['user_current_activity'],
      blockedFollowUpTopics: ['user_current_activity'],
      callbackHints: latestActivity
        ? [`User sudah menyebut sedang ${latestActivity}; jangan menanyakan aktivitas user lagi.`]
        : ['User sudah menyebut aktivitasnya; jangan menanyakan aktivitas user lagi.'],
    };
  }

  private extractCurrentActivity(text: string): string | null {
    for (const line of text.split(/\r?\n/u)) {
      const normalized = line.trim();

      if (!normalized || this.isQuestion(normalized)) {
        continue;
      }

      if (this.isSleepReluctance(normalized)) {
        return 'tidak ingin tidur sekarang';
      }

      const match =
        /\b(?:aku|saya)\s+(?:lagi|sedang)\s+([^.!?\n]{2,100})/iu.exec(normalized) ??
        /\b(?:chatting(?:an)?|ngobrol)\s+(?:sama|dengan)\s+([^.!?\n]{2,80})/iu.exec(normalized);

      if (!match) {
        continue;
      }

      const value = match[1]
        .replace(/\b(?:sebenarnya|sebenernya|tapi|bentar|doang|sih|nih|deh|dong)\b.*$/iu, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (value.length >= 2) {
        return value.slice(0, 100);
      }
    }

    return null;
  }

  private isSleepReluctance(text: string): boolean {
    return /\b(?:males|malas|belum pengin|belum mau|nggak mau|gak mau|ga mau|masih pengin|masih mau)\s+(?:buat\s+)?tidur\b/iu.test(text)
      || /\b(?:masih|belum)\s+melek\b/iu.test(text);
  }

  private isCharacterActivityQuestion(text: string): boolean {
    const normalized = text.trim().toLowerCase();

    return (
      /\b(?:kamu|lu|lo|km)\b.{0,28}\b(?:lagi\s+)?(?:ngapain|ngapa(?:in)?|apa\s+kabar|sibuk\s+apa|di\s+mana|dimana)\b/iu.test(
        normalized,
      ) ||
      /\b(?:kamu|lu|lo|km)\s+sendiri\b/iu.test(normalized)
    );
  }

  private isQuestion(text: string): boolean {
    return text.endsWith('?') || /\b(?:ngapain|lagi\s+apa|apa\s+kabar)\b/iu.test(text);
  }
}
