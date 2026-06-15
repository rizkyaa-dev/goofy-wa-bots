import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnv } from '../config/env.validation';
import { LlmService } from '../llm/llm.service';
import { IncomingMessage } from '../messages/domain/incoming-message';
import { RoleplayEmotionAnalysis } from './domain/roleplay-emotion-analysis';

const fallbackAnalysis: RoleplayEmotionAnalysis = {
  userTone: 'neutral',
  userIntent: 'continue_conversation',
  affectionDelta: 0,
  trustDelta: 0,
  tensionDelta: 0,
  energyDelta: 0,
  intimacyDelta: 0,
  shynessDelta: 0,
  avoidQuestion: false,
  replyDirective: 'Read the user literally and respond naturally.',
};

@Injectable()
export class EmotionClassifierService {
  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly llm: LlmService,
  ) {}

  async analyze(message: IncomingMessage, recentContext: string): Promise<RoleplayEmotionAnalysis> {
    if (!this.config.get('ROLEPLAY_EMOTION_CLASSIFIER_ENABLED')) {
      return fallbackAnalysis;
    }

    try {
      const result = await this.llm.generateReply({
        providerName: this.config.get('ROLEPLAY_EMOTION_CLASSIFIER_PROVIDER'),
        model: this.config.get('ROLEPLAY_EMOTION_CLASSIFIER_MODEL') || null,
        thinkingType: 'disabled',
        maxTokens: 220,
        messages: [
          {
            role: 'system',
            content: [
              'Classify the latest WhatsApp roleplay user message.',
              'Return strict JSON only, no markdown.',
              'Do not generate a character reply.',
              'Focus on nuance such as teasing, pressure, vulnerability, awkwardness, and whether another question would feel annoying.',
              'Allowed userTone: neutral, warm, playful, teasing, vulnerable, annoyed, pressuring, awkward.',
              'Deltas must be integers from -5 to 5.',
            ].join('\n'),
          },
          {
            role: 'user',
            content: JSON.stringify({
              recentContext,
              latestUserMessage: message.body,
              schema: {
                userTone: 'neutral|warm|playful|teasing|vulnerable|annoyed|pressuring|awkward',
                userIntent: 'short_snake_case',
                affectionDelta: 'integer -5..5',
                trustDelta: 'integer -5..5',
                tensionDelta: 'integer -5..5',
                energyDelta: 'integer -5..5',
                intimacyDelta: 'integer -5..5',
                shynessDelta: 'integer -5..5',
                avoidQuestion: 'boolean',
                replyDirective: 'short instruction for the reply generator',
              },
            }),
          },
        ],
      });

      return this.parseAnalysis(result.text);
    } catch {
      return fallbackAnalysis;
    }
  }

  private parseAnalysis(text: string): RoleplayEmotionAnalysis {
    const jsonText = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(jsonText) as Partial<RoleplayEmotionAnalysis>;

    return {
      userTone: this.isValidTone(parsed.userTone) ? parsed.userTone : fallbackAnalysis.userTone,
      userIntent: typeof parsed.userIntent === 'string' && parsed.userIntent ? parsed.userIntent : fallbackAnalysis.userIntent,
      affectionDelta: this.clampDelta(parsed.affectionDelta),
      trustDelta: this.clampDelta(parsed.trustDelta),
      tensionDelta: this.clampDelta(parsed.tensionDelta),
      energyDelta: this.clampDelta(parsed.energyDelta),
      intimacyDelta: this.clampDelta(parsed.intimacyDelta),
      shynessDelta: this.clampDelta(parsed.shynessDelta),
      avoidQuestion: Boolean(parsed.avoidQuestion),
      replyDirective:
        typeof parsed.replyDirective === 'string' && parsed.replyDirective
          ? parsed.replyDirective.slice(0, 220)
          : fallbackAnalysis.replyDirective,
    };
  }

  private isValidTone(value: unknown): value is RoleplayEmotionAnalysis['userTone'] {
    return (
      value === 'neutral' ||
      value === 'warm' ||
      value === 'playful' ||
      value === 'teasing' ||
      value === 'vulnerable' ||
      value === 'annoyed' ||
      value === 'pressuring' ||
      value === 'awkward'
    );
  }

  private clampDelta(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 0;
    }

    return Math.max(-5, Math.min(5, Math.round(value)));
  }
}
