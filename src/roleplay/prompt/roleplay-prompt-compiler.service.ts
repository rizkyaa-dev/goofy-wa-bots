import { Injectable } from '@nestjs/common';
import { LlmMessage } from '../../llm/domain/llm.types';
import { CharacterFoundationPromptBuilder } from './builders/character-foundation-prompt.builder';
import { ConversationContextPromptBuilder } from './builders/conversation-context-prompt.builder';
import { EmotionStatePromptBuilder } from './builders/emotion-state-prompt.builder';
import { IntimacyPolicyPromptBuilder } from './builders/intimacy-policy-prompt.builder';
import { MemoryQuoteOutputPromptBuilder } from './builders/memory-quote-output-prompt.builder';
import { PresenceContextPromptBuilder } from './builders/presence-context-prompt.builder';
import { ResponseStylePromptBuilder } from './builders/response-style-prompt.builder';
import { TimeContextPromptBuilder } from './builders/time-context-prompt.builder';
import { CompileInput } from './domain/roleplay-prompt-compile-input';

@Injectable()
export class RoleplayPromptCompilerService {
  constructor(
    private readonly characterFoundationPrompt: CharacterFoundationPromptBuilder,
    private readonly emotionStatePrompt: EmotionStatePromptBuilder,
    private readonly intimacyPolicyPrompt: IntimacyPolicyPromptBuilder,
    private readonly presenceContextPrompt: PresenceContextPromptBuilder,
    private readonly timeContextPrompt: TimeContextPromptBuilder,
    private readonly conversationContextPrompt: ConversationContextPromptBuilder,
    private readonly responseStylePrompt: ResponseStylePromptBuilder,
    private readonly memoryQuoteOutputPrompt: MemoryQuoteOutputPromptBuilder,
  ) {}

  compile(input: CompileInput): LlmMessage[] {
    return [
      {
        role: 'system',
        content: this.createSystemPrompt(input),
      },
      ...input.recentMessages,
    ];
  }

  private createSystemPrompt(input: CompileInput): string {
    return [
      ...this.characterFoundationPrompt.build(input),
      ...this.emotionStatePrompt.build(input),
      ...this.intimacyPolicyPrompt.build(input),
      ...this.presenceContextPrompt.build(input),
      ...this.timeContextPrompt.build(input),
      ...this.conversationContextPrompt.build(input),
      ...this.responseStylePrompt.build(input),
      ...this.memoryQuoteOutputPrompt.build(input),
    ]
      .filter((line) => line !== '')
      .join('\n');
  }
}
