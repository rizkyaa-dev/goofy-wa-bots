import { Injectable } from '@nestjs/common';
import { RoleplayMemory } from '@prisma/client';
import { LlmMessage } from '../../llm/domain/llm.types';
import { RoleplayIdentityQuestionDetectorService } from '../identity/roleplay-identity-question-detector.service';

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
  constructor(private readonly identityQuestionDetector: RoleplayIdentityQuestionDetectorService) {}

  apply(input: ContinuityGuardInput): string {
    if (!this.hasContinuityClaim(input.text)) {
      return input.text;
    }

    if (this.hasClaimEvidence(input)) {
      return input.text;
    }

    return this.createFallbackReply(input);
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

  private createFallbackReply(input: ContinuityGuardInput): string {
    if (this.isCharacterNameQuestion(input.latestUserMessage)) {
      return `Aku ${input.characterName}.`;
    }

    return 'Eh, emang iya ya? Lupa aku.';
  }

  private hasContinuityClaim(text: string): boolean {
    return /(?:udah|sudah|kan|tadi|barusan|dulu|pernah|ingat|inget).{0,24}(?:bilang|kubilang|nyebut|sebutin|cerita)/iu.test(text);
  }

  private isCharacterNameQuestion(text: string): boolean {
    return this.identityQuestionDetector.isCharacterNameQuestion(text);
  }

  private containsCharacterName(text: string, characterName: string): boolean {
    return text.toLowerCase().includes(characterName.toLowerCase());
  }
}
