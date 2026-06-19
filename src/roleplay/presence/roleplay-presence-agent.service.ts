import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoleplayPresenceState, RoleplayState } from '@prisma/client';
import { AppEnv } from '../../config/env.validation';
import { LlmMessage } from '../../llm/domain/llm.types';
import { LlmService } from '../../llm/llm.service';
import { InternalDisclosureGuardService } from '../validation/internal-disclosure-guard.service';
import {
  RoleplayPresenceActivityType,
  RoleplayPresenceDraft,
  RoleplayPresenceEmotionalBias,
  RoleplayPresenceInterruptibility,
  RoleplayPresenceSocialContext,
  normalizeRoleplayPresenceActivityType,
  roleplayPresenceActivities,
  roleplayPresenceInterruptibilities,
  roleplayPresenceSocialContexts,
} from './domain/roleplay-presence.types';

type EnhancePresenceInput = {
  chatId: string;
  baseline: RoleplayPresenceDraft;
  state: RoleplayState;
  current?: RoleplayPresenceState | null;
  latestUserMessage?: string;
  recentMessages?: LlmMessage[];
  reason: string;
  now: Date;
  emotionalBias?: RoleplayPresenceEmotionalBias;
};

type PresenceAgentResponse = {
  activityType?: string;
  statusText?: string;
  locationLabel?: string;
  socialContext?: string;
  interruptibility?: string;
  priority?: number;
  lastReason?: string;
};

@Injectable()
export class RoleplayPresenceAgentService {
  private readonly logger = new Logger(RoleplayPresenceAgentService.name);

  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly internalDisclosureGuard: InternalDisclosureGuardService,
    private readonly llm: LlmService,
  ) {}

  async enhance(input: EnhancePresenceInput): Promise<RoleplayPresenceDraft> {
    if (!this.config.get('ROLEPLAY_PRESENCE_AGENT_ENABLED')) {
      return input.baseline;
    }

    try {
      const response = await this.withTimeout(
        this.llm.generateReply({
          providerName: this.resolveProvider(),
          model: this.resolveModel(),
          temperature: this.config.get('ROLEPLAY_PRESENCE_AGENT_TEMPERATURE') ?? 0.7,
          maxTokens: this.config.get('ROLEPLAY_PRESENCE_AGENT_MAX_TOKENS'),
          thinkingType: 'disabled',
          messages: this.createPrompt(input),
        }),
        this.config.get('ROLEPLAY_PRESENCE_AGENT_TIMEOUT_MS'),
      );

      return this.sanitizeResponse(this.parseJson(response.text), input.baseline, input.emotionalBias);
    } catch (error) {
      this.logger.warn(`Presence agent fallback used: ${error instanceof Error ? error.message : String(error)}`);
      return input.baseline;
    }
  }

  private createPrompt(input: EnhancePresenceInput): LlmMessage[] {
    return [
      {
        role: 'system',
        content: [
          'You are a constrained presence-state planner for a fictional WhatsApp roleplay character.',
          'Your only task is to refine an off-chat activity snapshot. Do NOT engage in conversation.',
          'MANDATORY: Return strict raw JSON only. Do NOT wrap output in markdown code blocks (e.g., do NOT use ```json).',
          'Guidelines:',
          '- Keep continuity stable. Avoid sudden location teleports, major time skips, or dramatic events.',
          '- Keep the character activities mundane, ordinary, and believable (e.g., study, chores, eating, resting, walking).',
          '- activityType: Short, lowercase snake_case label (e.g., studying_math, doing_laundry). You can customize this to fit the context.',
          '- statusText: Short, casual, natural lowercase Indonesian text detailing the activity (maximum 90 characters).',
          '- Do NOT invent high-drama situations, emergencies, new jobs, sudden long travel, or medical crises.',
          '- Respect the emotionalBias constraints. For private_charged bias, keep statusText subtle, private, and strictly non-explicit.',
          '- Never reference technical system terms (e.g., AI, bot, scheduler, database, state, tokens) in statusText.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: JSON.stringify({
          nowIso: input.now.toISOString(),
          chatId: input.chatId,
          reason: input.reason,
          baseline: this.serializeDraft(input.baseline),
          current: input.current ? this.serializeCurrent(input.current) : null,
          emotionalBias: input.emotionalBias ? this.serializeEmotionalBias(input.emotionalBias) : null,
          latestUserMessage: input.latestUserMessage ?? '',
          recentMessages: this.formatRecentMessages(input.recentMessages ?? []),
          roleplayState: {
            mood: input.state.mood,
            affection: input.state.affection,
            trust: input.state.trust,
            energy: input.state.energy,
            tension: input.state.tension,
            intimacy: input.state.intimacy,
            shyness: input.state.shyness,
            curiosity: input.state.curiosity,
            volatility: this.getStateValue(input.state, 'volatility', 15),
            desire: this.getStateValue(input.state, 'desire', 20),
            inhibition: this.getStateValue(input.state, 'inhibition', 55),
            comfort: this.getStateValue(input.state, 'comfort', 55),
            compliance: this.getStateValue(input.state, 'compliance', 40),
            summary: input.state.summary,
          },
          allowed: {
            suggestedActivityPresets: roleplayPresenceActivities,
            socialContext: roleplayPresenceSocialContexts,
            interruptibility: roleplayPresenceInterruptibilities,
          },
          hardRules: [
            'Improve baseline wording. Choose a more descriptive activityType snake_case label if it fits better.',
            'Respect emotionalBias rules (activityBias, avoidActivities).',
            'If moodDrive is private_charged, focus on subtle private moments. Do NOT create sexual activities.',
            'Preserve startedAt and expiresAt.',
            'Priority must be an integer from 1 to 100.',
            'If uncertain, return baseline values with a refined statusText.',
          ],
          outputSchema: {
            activityType: 'lowercase snake_case activity label, max 48 characters',
            statusText: 'short casual Indonesian text, max 90 characters',
            locationLabel: 'short place label, max 28 characters',
            socialContext: roleplayPresenceSocialContexts.join('|'),
            interruptibility: roleplayPresenceInterruptibilities.join('|'),
            priority: 'integer 1..100',
            lastReason: 'short snake_case tag describing update reason',
          },
        }),
      },
    ];
  }

  private sanitizeResponse(
    parsed: PresenceAgentResponse,
    baseline: RoleplayPresenceDraft,
    emotionalBias?: RoleplayPresenceEmotionalBias,
  ): RoleplayPresenceDraft {
    const parsedActivityType = this.cleanActivityType(parsed.activityType, baseline.activityType);

    return {
      ...baseline,
      activityType: this.resolveBiasedActivity(parsedActivityType, baseline, emotionalBias),
      statusText: this.cleanStatusText(parsed.statusText, baseline.statusText),
      locationLabel: this.cleanLocation(parsed.locationLabel, baseline.locationLabel),
      socialContext: this.parseEnum(parsed.socialContext, roleplayPresenceSocialContexts, baseline.socialContext),
      interruptibility: this.parseEnum(parsed.interruptibility, roleplayPresenceInterruptibilities, baseline.interruptibility),
      priority: this.clampInteger(parsed.priority, 1, 100, baseline.priority),
      lastReason: this.cleanReason(parsed.lastReason, baseline.lastReason ?? 'presence_agent_enriched'),
    };
  }

  private parseJson(text: string): PresenceAgentResponse {
    const jsonText = text.trim().replace(/^```(?:json)?/iu, '').replace(/```$/iu, '').trim();
    return JSON.parse(jsonText) as PresenceAgentResponse;
  }

  private parseEnum<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
    return value && allowed.includes(value as T) ? (value as T) : fallback;
  }

  private resolveBiasedActivity(
    activityType: RoleplayPresenceActivityType,
    baseline: RoleplayPresenceDraft,
    emotionalBias?: RoleplayPresenceEmotionalBias,
  ): RoleplayPresenceActivityType {
    if (!emotionalBias) {
      return activityType;
    }

    if (emotionalBias.avoidActivities.includes(activityType)) {
      return baseline.activityType;
    }

    return activityType;
  }

  private cleanActivityType(value: string | undefined, fallback: RoleplayPresenceActivityType): RoleplayPresenceActivityType {
    const cleaned = normalizeRoleplayPresenceActivityType(value, fallback);
    const guarded = this.internalDisclosureGuard.sanitizeGeneratedSnippet(cleaned, fallback);
    return normalizeRoleplayPresenceActivityType(guarded, fallback);
  }

  private cleanStatusText(value: string | undefined, fallback: string): string {
    const cleaned = this.cleanText(value, 90);
    return this.internalDisclosureGuard.sanitizeGeneratedSnippet(cleaned, fallback);
  }

  private cleanLocation(value: string | undefined, fallback: string): string {
    return this.cleanText(value, 28) || fallback;
  }

  private cleanReason(value: string | undefined, fallback: string): string {
    const cleaned = this.cleanText(value, 48)
      .toLowerCase()
      .replace(/[^a-z0-9_]+/gu, '_')
      .replace(/^_+|_+$/gu, '');

    return cleaned || fallback;
  }

  private cleanText(value: string | undefined, maxLength: number): string {
    return String(value ?? '')
      .replace(/[\r\n]+/gu, ' ')
      .replace(/\s{2,}/gu, ' ')
      .trim()
      .slice(0, maxLength)
      .trim();
  }

  private clampInteger(value: number | undefined, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value)) {
      return fallback;
    }

    return Math.max(min, Math.min(max, Math.round(value as number)));
  }

  private resolveProvider(): string {
    return this.config.get('ROLEPLAY_PRESENCE_AGENT_PROVIDER') || this.config.get('ROLEPLAY_ROUTER_PROVIDER');
  }

  private resolveModel(): string {
    return this.config.get('ROLEPLAY_PRESENCE_AGENT_MODEL') || this.config.get('ROLEPLAY_ROUTER_MODEL');
  }

  private serializeDraft(draft: RoleplayPresenceDraft): Record<string, unknown> {
    return {
      activityType: draft.activityType,
      statusText: draft.statusText,
      locationLabel: draft.locationLabel,
      socialContext: draft.socialContext,
      interruptibility: draft.interruptibility,
      source: draft.source,
      priority: draft.priority,
      startedAt: draft.startedAt.toISOString(),
      expiresAt: draft.expiresAt.toISOString(),
      lastReason: draft.lastReason,
    };
  }

  private serializeCurrent(current: RoleplayPresenceState): Record<string, unknown> {
    return {
      activityType: current.activityType,
      statusText: current.statusText,
      locationLabel: current.locationLabel,
      socialContext: current.socialContext,
      interruptibility: current.interruptibility,
      source: current.source,
      priority: current.priority,
      startedAt: current.startedAt.toISOString(),
      expiresAt: current.expiresAt.toISOString(),
      lastReason: current.lastReason,
    };
  }

  private serializeEmotionalBias(bias: RoleplayPresenceEmotionalBias): Record<string, unknown> {
    return {
      moodDrive: bias.moodDrive,
      activityBias: bias.activityBias,
      avoidActivities: bias.avoidActivities,
      availabilityBias: bias.availabilityBias,
      wordingStyle: bias.wordingStyle,
      reasonTag: bias.reasonTag,
      guidance: bias.guidance,
    };
  }

  private formatRecentMessages(messages: LlmMessage[]): Array<{ role: string; content: string }> {
    return messages.slice(-8).map((message) => ({
      role: message.role,
      content: message.content.slice(0, 220),
    }));
  }

  private getStateValue(state: RoleplayState, key: 'volatility' | 'desire' | 'inhibition' | 'comfort' | 'compliance', fallback: number): number {
    return (state as RoleplayState & Record<typeof key, number | undefined>)[key] ?? fallback;
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error(`Presence agent timed out after ${timeoutMs}ms`)), timeoutMs);
        }),
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }
}
