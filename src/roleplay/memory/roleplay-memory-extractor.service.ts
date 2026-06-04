import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoleplayMemoryKind } from '@prisma/client';
import { AppEnv } from '../../config/env.validation';
import { LlmService } from '../../llm/llm.service';
import { IncomingMessage } from '../../messages/domain/incoming-message';
import { ExtractedRoleplayMemory } from './domain/extracted-roleplay-memory';

type ExtractorResponse = {
  memories?: Array<{
    kind?: string;
    content?: string;
    importance?: number;
    confidence?: number;
    sourceText?: string;
    ttl?: string;
  }>;
};

@Injectable()
export class RoleplayMemoryExtractorService {
  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly llm: LlmService,
  ) {}

  async extract(message: IncomingMessage, recentContext: string): Promise<ExtractedRoleplayMemory[]> {
    const result = await this.llm.generateReply({
      providerName: this.config.get('ROLEPLAY_MEMORY_EXTRACTOR_PROVIDER'),
      model: this.config.get('ROLEPLAY_MEMORY_EXTRACTOR_MODEL') || null,
      maxTokens: 520,
      messages: [
        {
          role: 'system',
          content: [
            'You are a memory extraction engine for a WhatsApp roleplay chatbot.',
            'Extract only stable information that is useful for future conversations.',
            'Return strict JSON only, no markdown.',
            'Do not generate a character reply.',
            'Do not over-infer. If information is ambiguous or temporary, skip it.',
            'Valid kind values: user_fact, preference, relationship, episode, boundary, goal.',
            'Valid ttl values: session, short_term, long_term.',
            'Importance is 1-100. Confidence is 0-1.',
            'Max 3 memories.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            recentContext,
            latestUserMessage: message.body,
            saveExamples: [
              'User preferred name or nickname',
              'User preferences and boundaries',
              'Current project, goal, or ongoing problem',
              'Relationship shift, promise, conflict, or important episode',
            ],
            skipExamples: ['greetings', 'one-off questions', 'small talk with no future value', 'uncertain guesses'],
            outputSchema: {
              memories: [
                {
                  kind: 'user_fact|preference|relationship|episode|boundary|goal',
                  content: 'short normalized memory in Indonesian',
                  importance: 'integer 1..100',
                  confidence: 'number 0..1',
                  sourceText: 'exact text fragment from latestUserMessage',
                  ttl: 'session|short_term|long_term',
                },
              ],
            },
          }),
        },
      ],
    });

    return this.parse(result.text);
  }

  private parse(text: string): ExtractedRoleplayMemory[] {
    const jsonText = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(jsonText) as ExtractorResponse;

    return (parsed.memories ?? []).map((memory) => ({
      kind: this.parseKind(memory.kind),
      content: memory.content ?? '',
      importance: memory.importance ?? 50,
      confidence: memory.confidence ?? 0,
      sourceText: memory.sourceText ?? '',
      ttl: this.parseTtl(memory.ttl),
    }));
  }

  private parseKind(kind?: string): RoleplayMemoryKind {
    if (kind && kind in RoleplayMemoryKind) {
      return RoleplayMemoryKind[kind as keyof typeof RoleplayMemoryKind];
    }

    return RoleplayMemoryKind.episode;
  }

  private parseTtl(ttl?: string): ExtractedRoleplayMemory['ttl'] {
    if (ttl === 'session' || ttl === 'short_term' || ttl === 'long_term') {
      return ttl;
    }

    return 'long_term';
  }
}
