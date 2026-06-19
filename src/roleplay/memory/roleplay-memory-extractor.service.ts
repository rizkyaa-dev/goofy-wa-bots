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
      thinkingType: 'disabled',
      maxTokens: 520,
      messages: [
        {
          role: 'system',
          content: [
            'You are a high-precision memory extraction engine for a WhatsApp roleplay chatbot.',
            'MANDATORY: Return strict raw JSON only. Do NOT wrap output in markdown code blocks (e.g., do NOT use ```json).',
            'Your core task is to extract stable, useful information from the user\'s latest message to build long-term memory.',
            'Do NOT write a character reply or converse with the user.',
            'Guidelines:',
            '- Do NOT over-infer. If information is ambiguous, temporary, or small talk, do NOT extract it.',
            '- Valid kind values: user_fact (facts about user), preference (user likes/dislikes), relationship (nicknames, closeness), episode (shared events, stories), boundary (topics/words user dislikes), goal (ongoing projects, problems).',
            '- Valid ttl values: session, short_term, long_term.',
            '- Importance: Integer 1 to 100. Confidence: Floating number 0 to 1.',
            '- Extract a maximum of 3 memories per invocation.',
            '- Format names and nicknames into separate, normalized memories.',
            '- If the user explicitly permits or requests an affectionate nickname (e.g., sayang, ayang, syg, ay), save it under "relationship" with the allowed alias and context.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            recentContext,
            latestUserMessage: message.body,
            saveExamples: [
              'User preferred name, nickname, or how to call them',
              'Allowed affectionate nicknames (e.g., sayang/syg)',
              'User preferences, boundaries, or disliked topics',
              'Current project, work, study, ongoing problems, or milestones',
              'Relationship shifts, promises, major stories, or shared episodes',
            ],
            skipExamples: [
              'Greetings and farewells',
              'One-off questions or statements about the current moment (e.g., "aku lagi makan")',
              'Small talk with no future conversational value',
              'Uncertain guesses or vague statements',
            ],
            outputSchema: {
              memories: [
                {
                  kind: 'user_fact|preference|relationship|episode|boundary|goal',
                  content: 'short normalized memory text in Indonesian',
                  importance: 'integer 1..100',
                  confidence: 'number 0..1',
                  sourceText: 'exact text segment from latestUserMessage that supports this memory',
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
