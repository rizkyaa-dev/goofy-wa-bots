import { Injectable } from '@nestjs/common';
import { RoleplayMemory } from '@prisma/client';
import { LlmMessage } from '../llm/domain/llm.types';

type ContinuityGuardInput = {
  text: string;
  latestUserMessage: string;
  characterName: string;
  recentMessages: LlmMessage[];
  memories: RoleplayMemory[];
  quoteTargetText?: string;
};

@Injectable()
export class ContinuityGuardService {
  apply(input: ContinuityGuardInput): string {
    if (!this.hasContinuityClaim(input.text)) {
      return input.text;
    }

    if (this.hasClaimEvidence(input)) {
      return input.text;
    }

    const sanitized = this.removeUnsupportedContinuityClaims(input.text);

    if (this.isCharacterNameQuestion(input.latestUserMessage) && !this.containsCharacterName(sanitized, input.characterName)) {
      return `Aku ${input.characterName}.`;
    }

    return sanitized || this.createFallbackReply(input);
  }

  private hasClaimEvidence(input: ContinuityGuardInput): boolean {
    if (input.quoteTargetText?.trim()) {
      return true;
    }

    if (this.isCharacterNameQuestion(input.latestUserMessage)) {
      return input.recentMessages.some(
        (message) => message.role === 'assistant' && this.containsCharacterName(message.content, input.characterName),
      );
    }

    return input.memories.some((memory) => memory.content.trim().length > 0);
  }

  private removeUnsupportedContinuityClaims(text: string): string {
    return text
      .split(/(?<=[.!?])\s+/u)
      .map((sentence) => this.removeContinuityClause(sentence))
      .filter((sentence) => sentence.trim().length > 0)
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private removeContinuityClause(sentence: string): string {
    const riskyClausePatterns = [
      /\b(?:kan\s+)?(?:udah|sudah)\s+(?:aku\s+bilang|kubilang(?:in)?)\s+(?:tadi|barusan)?\s*(?:loh|lho|ya|kok|kan|hehe|wkwk)?[,.!?\s]*/giu,
      /\b(?:kan\s+)?tadi\s+(?:aku\s+)?(?:bilang|nyebut|sebutin)\s*(?:loh|lho|ya|kok|kan|hehe|wkwk)?[,.!?\s]*/giu,
      /\b(?:dulu|tadi|barusan)\s+(?:kamu|aku)\s+(?:pernah\s+)?(?:bilang|nyebut|cerita)\s*(?:loh|lho|ya|kok|kan|hehe|wkwk)?[,.!?\s]*/giu,
      /\b(?:aku\s+)?(?:ingat|inget)\s+(?:kamu\s+)?(?:pernah\s+)?(?:bilang|cerita)\s*(?:loh|lho|ya|kok|kan|hehe|wkwk)?[,.!?\s]*/giu,
    ];

    return riskyClausePatterns
      .reduce((current, pattern) => current.replace(pattern, ''), sentence)
      .replace(/\s+([,.!?])/gu, '$1')
      .replace(/^[,.\s]+/gu, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private createFallbackReply(input: ContinuityGuardInput): string {
    if (this.isCharacterNameQuestion(input.latestUserMessage)) {
      return `Aku ${input.characterName}.`;
    }

    return 'Oh iya, maksudku gitu.';
  }

  private hasContinuityClaim(text: string): boolean {
    return /(?:udah|sudah|kan|tadi|barusan|dulu|pernah|ingat|inget).{0,24}(?:bilang|kubilang|nyebut|sebutin|cerita)/iu.test(text);
  }

  private isCharacterNameQuestion(text: string): boolean {
    const normalized = text.toLowerCase();
    return /\b(?:nama|namamu|nama\s+kamu|siapa)\b/u.test(normalized) && /\b(?:kamu|mu|bot|alya|namamu|nama)\b/u.test(normalized);
  }

  private containsCharacterName(text: string, characterName: string): boolean {
    return text.toLowerCase().includes(characterName.toLowerCase());
  }
}
