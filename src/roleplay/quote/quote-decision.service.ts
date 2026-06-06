import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoleplayMemory } from '@prisma/client';
import { AppEnv } from '../../config/env.validation';
import { LlmService } from '../../llm/llm.service';
import { LlmProviderError } from '../../llm/errors/llm-provider.error';
import { QuoteCandidate } from './domain/quote-candidate';
import { noQuoteDecision, QuoteDecision, QuoteIntent } from './domain/quote-decision';

type QuoteDecisionResponse = {
  action?: string;
  targetMessageId?: string | null;
  intent?: string;
  instruction?: string;
  confidence?: number;
};

@Injectable()
export class QuoteDecisionService {
  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly llm: LlmService,
  ) {}

  async decide(input: DecideQuoteInput): Promise<QuoteDecision> {
    if (input.candidates.length === 0) {
      return noQuoteDecision;
    }

    try {
      const result = await this.llm.generateReply({
        providerName: this.config.get('ROLEPLAY_QUOTE_PROVIDER'),
        model: this.config.get('ROLEPLAY_QUOTE_MODEL'),
        temperature: 0.1,
        maxTokens: 420,
        messages: [
          {
            role: 'system',
            content: [
              'You are a quote decision engine for a WhatsApp roleplay bot.',
              'Decide whether the bot should send a normal message or quote-reply a specific previous user message.',
              'Use quote_reply only when quoting clearly improves clarity, evidence, teasing, callback, contradiction handling, boundary recall, or emotional continuity.',
              'Do not quote every reply. Prefer none unless quote materially helps.',
              'Never quote commands, system outputs, secrets, OTP, passwords, API keys, tokens, or sensitive financial data.',
              'Return strict JSON only. No markdown.',
            ].join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify({
              latestUserTurn: input.latestUserTurn,
              recentContext: input.recentContext,
              memories: input.memories.map((memory) => ({
                kind: memory.kind,
                content: memory.content,
              })),
              candidates: input.candidates.map((candidate) => ({
                messageId: candidate.messageId,
                body: candidate.body,
                reasonHint: candidate.reasonHint,
              })),
              quoteUseCases: {
                clarify: 'Latest user message is ambiguous, absurd, typo-heavy, or context is unclear. Quote the exact unclear bubble and ask shortly.',
                evidence: 'User asks for proof or denies saying something. Never quote latestUserTurn itself as proof; choose an older candidate containing the evidence.',
                tease: 'Light playful contradiction or callback, not hostile.',
                callback: 'A previous message is directly useful to continue the current topic.',
                boundary: 'User violates or asks about a boundary/preference they stated before.',
                emotional_recall: 'A previous emotional moment is highly relevant and not creepy to reference.',
              },
              outputSchema: {
                action: 'none|quote_reply',
                targetMessageId: 'string|null',
                intent: 'none|clarify|evidence|tease|callback|contradiction|boundary|emotional_recall',
                instruction: 'short instruction for reply generator',
                confidence: 'number 0..1',
              },
            }),
          },
        ],
      });

      return this.parse(result.text);
    } catch (error) {
      if (error instanceof LlmProviderError) {
        return noQuoteDecision;
      }

      return noQuoteDecision;
    }
  }

  private parse(text: string): QuoteDecision {
    const jsonText = text.trim().replace(/^```(?:json)?/iu, '').replace(/```$/iu, '').trim();
    const parsed = JSON.parse(jsonText) as QuoteDecisionResponse;
    const action = parsed.action === 'quote_reply' ? 'quote_reply' : 'none';

    if (action === 'none') {
      return noQuoteDecision;
    }

    return {
      action,
      targetMessageId: parsed.targetMessageId ?? undefined,
      intent: this.parseIntent(parsed.intent),
      instruction: parsed.instruction ?? '',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    };
  }

  private parseIntent(intent?: string): QuoteIntent {
    if (
      intent === 'clarify' ||
      intent === 'evidence' ||
      intent === 'tease' ||
      intent === 'callback' ||
      intent === 'contradiction' ||
      intent === 'boundary' ||
      intent === 'emotional_recall'
    ) {
      return intent;
    }

    return 'none';
  }
}

type DecideQuoteInput = {
  latestUserTurn: string;
  recentContext: string;
  candidates: QuoteCandidate[];
  memories: RoleplayMemory[];
};
